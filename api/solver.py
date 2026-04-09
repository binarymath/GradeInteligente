import json
import traceback
from http.server import BaseHTTPRequestHandler

from ortools.sat.python import cp_model


DEFAULT_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _get_slot_indices(payload):
    time_slots = payload.get("timeSlots") or []
    if isinstance(time_slots, list) and time_slots:
        lesson_indices = [
            idx for idx, slot in enumerate(time_slots)
            if isinstance(slot, dict) and slot.get("type") == "aula"
        ]
        if lesson_indices:
            return lesson_indices
        return list(range(len(time_slots)))

    slot_count = _safe_int(payload.get("slotCount"), 7)
    if slot_count <= 0:
        slot_count = 7
    return list(range(slot_count))


def _contains_slot(slots, slot_id, slot_idx):
    if not isinstance(slots, list):
        return False

    slot_id_str = str(slot_id)
    slot_idx_str = str(slot_idx)
    for item in slots:
        if item == slot_id:
            return True
        item_str = str(item)
        if item_str == slot_id_str or item_str == slot_idx_str:
            return True
    return False


def _is_class_slot_active(class_obj, day_idx, slot_obj, slot_idx):
    if not isinstance(class_obj, dict):
        return False

    slot_id = slot_obj.get("id", str(slot_idx)) if isinstance(slot_obj, dict) else str(slot_idx)

    active_by_day = class_obj.get("activeSlotsByDay")
    if isinstance(active_by_day, dict) and active_by_day:
        day_slots = active_by_day.get(day_idx)
        if day_slots is None:
            day_slots = active_by_day.get(str(day_idx))
        return _contains_slot(day_slots, slot_id, slot_idx)

    active_slots = class_obj.get("activeSlots")
    if isinstance(active_slots, list) and active_slots:
        return _contains_slot(active_slots, slot_id, slot_idx)

    return False


def _is_unavailable(entity_obj, day_label, slot_idx):
    if not isinstance(entity_obj, dict):
        return False

    unavailable = entity_obj.get("unavailable")
    if not isinstance(unavailable, list) or not unavailable:
        return False

    time_key = f"{day_label}-{slot_idx}"
    return time_key in unavailable


def _normalize_teacher_name(name):
    if name is None:
        return ""
    return str(name).strip().lower()


def _time_to_minutes(value):
    if not value or not isinstance(value, str) or ":" not in value:
        return None
    try:
        hh, mm = value.split(":", 1)
        return int(hh) * 60 + int(mm)
    except (TypeError, ValueError):
        return None


def _to_json(handler, status_code, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            content_length = _safe_int(self.headers.get("Content-Length"), 0)
            if content_length <= 0:
                _to_json(self, 400, {"error": "Corpo da requisição vazio."})
                return

            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))

            classes = payload.get("classes") or []
            teachers = payload.get("teachers") or []
            subjects = payload.get("subjects") or []
            activities = payload.get("activities") or []
            time_slots = payload.get("timeSlots") or []

            if (
                not isinstance(classes, list)
                or not isinstance(teachers, list)
                or not isinstance(subjects, list)
                or not isinstance(activities, list)
            ):
                _to_json(self, 400, {"error": "Formato inválido. classes, teachers e activities devem ser arrays."})
                return

            class_ids = [c.get("id") for c in classes if isinstance(c, dict) and c.get("id")]
            teacher_ids = [t.get("id") for t in teachers if isinstance(t, dict) and t.get("id")]
            subject_ids = [s.get("id") for s in subjects if isinstance(s, dict) and s.get("id")]

            if not class_ids or not teacher_ids:
                _to_json(self, 400, {"error": "É necessário informar turmas e professores com campo id."})
                return

            days = payload.get("days")
            if isinstance(days, list) and days:
                day_labels = [str(day) for day in days if day]
            else:
                day_labels = DEFAULT_DAYS

            if not day_labels:
                day_labels = DEFAULT_DAYS

            slot_indices = _get_slot_indices(payload)
            if not slot_indices:
                _to_json(self, 400, {"error": "Não há slots disponíveis para alocação."})
                return

            class_set = set(class_ids)
            teacher_set = set(teacher_ids)
            subject_set = set(subject_ids)

            class_map = {c.get("id"): c for c in classes if isinstance(c, dict) and c.get("id")}
            teacher_map = {t.get("id"): t for t in teachers if isinstance(t, dict) and t.get("id")}
            subject_map = {s.get("id"): s for s in subjects if isinstance(s, dict) and s.get("id")}

            teacher_name_groups = {}
            for teacher in teachers:
                if not isinstance(teacher, dict):
                    continue
                teacher_id = teacher.get("id")
                if not teacher_id:
                    continue
                normalized_name = _normalize_teacher_name(teacher.get("name"))
                if not normalized_name:
                    continue
                if normalized_name not in teacher_name_groups:
                    teacher_name_groups[normalized_name] = set()
                teacher_name_groups[normalized_name].add(teacher_id)

            total_slots = len(day_labels) * len(slot_indices)

            overlapping_slot_pairs = []
            for i in slot_indices:
                if i >= len(time_slots) or not isinstance(time_slots[i], dict):
                    continue
                si = time_slots[i]
                start_i = _time_to_minutes(si.get("start"))
                end_i = _time_to_minutes(si.get("end"))
                if start_i is None or end_i is None:
                    continue
                for j in slot_indices:
                    if j <= i or j >= len(time_slots) or not isinstance(time_slots[j], dict):
                        continue
                    sj = time_slots[j]
                    start_j = _time_to_minutes(sj.get("start"))
                    end_j = _time_to_minutes(sj.get("end"))
                    if start_j is None or end_j is None:
                        continue
                    # Overlap real: [start_i, end_i) cruza [start_j, end_j)
                    if start_i < end_j and end_i > start_j:
                        overlapping_slot_pairs.append((i, j))

            # Mantém granularidade por atividade para evitar falso positivo.
            normalized_activities = []
            for idx, activity in enumerate(activities):
                if not isinstance(activity, dict):
                    continue

                class_id = activity.get("classId")
                teacher_id = activity.get("teacherId")
                subject_id = activity.get("subjectId")
                quantity = _safe_int(activity.get("quantity"), 0)

                if quantity <= 0:
                    continue

                if not class_id or not teacher_id or not subject_id:
                    _to_json(
                        self,
                        400,
                        {
                            "error": "Atividade inválida: classId, teacherId e subjectId são obrigatórios para quantity > 0.",
                            "details": f"Atividade {idx} está incompleta.",
                        },
                    )
                    return

                if class_id not in class_set:
                    _to_json(self, 400, {"error": f"Atividade com classId inválido: {class_id}"})
                    return
                if teacher_id not in teacher_set:
                    _to_json(self, 400, {"error": f"Atividade com teacherId inválido: {teacher_id}"})
                    return
                if subject_ids and subject_id not in subject_set:
                    _to_json(self, 400, {"error": f"Atividade com subjectId inválido: {subject_id}"})
                    return

                if quantity > total_slots:
                    _to_json(
                        self,
                        422,
                        {
                            "error": "Quantidade de aulas inviável para a janela de tempo.",
                            "details": f"Atividade {idx} requer {quantity}, mas há apenas {total_slots} slots totais.",
                        },
                    )
                    return

                normalized_activities.append(
                    {
                        "idx": idx,
                        "classId": class_id,
                        "teacherId": teacher_id,
                        "subjectId": subject_id,
                        "quantity": quantity,
                    }
                )

            if not normalized_activities:
                _to_json(self, 400, {"error": "Nenhuma atividade válida encontrada para otimização."})
                return

            valid_positions = {}
            for activity in normalized_activities:
                class_id = activity["classId"]
                teacher_id = activity["teacherId"]
                subject_id = activity["subjectId"]

                cls = class_map.get(class_id, {})
                teacher = teacher_map.get(teacher_id, {})
                subject = subject_map.get(subject_id, {})

                positions = []
                for day_idx, day_label in enumerate(day_labels):
                    for abs_slot_idx in slot_indices:
                        slot_obj = time_slots[abs_slot_idx] if abs_slot_idx < len(time_slots) else {}

                        if isinstance(slot_obj, dict) and slot_obj.get("type") not in (None, "aula"):
                            continue

                        if not _is_class_slot_active(cls, day_idx, slot_obj, abs_slot_idx):
                            continue
                        if _is_unavailable(teacher, day_label, abs_slot_idx):
                            continue
                        if _is_unavailable(subject, day_label, abs_slot_idx):
                            continue

                        positions.append((day_idx, abs_slot_idx))

                valid_positions[activity["idx"]] = positions

                if len(positions) < activity["quantity"]:
                    _to_json(
                        self,
                        422,
                        {
                            "error": "Atividade inviável com as restrições atuais.",
                            "details": (
                                f"{class_id}/{subject_id}/{teacher_id}: precisa {activity['quantity']} slots, "
                                f"mas possui apenas {len(positions)} disponíveis."
                            ),
                        },
                    )
                    return

            model = cp_model.CpModel()

            x = {}
            for activity in normalized_activities:
                a_idx = activity["idx"]
                for day_idx, slot_idx in valid_positions[a_idx]:
                    var_name = f"x_{a_idx}_{day_idx}_{slot_idx}"
                    x[(a_idx, day_idx, slot_idx)] = model.NewBoolVar(var_name)

            # Restrição 1: professor em no máximo uma turma por slot.
            for teacher_id in teacher_ids:
                for day_idx in range(len(day_labels)):
                    for slot_idx in slot_indices:
                        teacher_vars = []
                        for activity in normalized_activities:
                            if activity["teacherId"] != teacher_id:
                                continue
                            key = (activity["idx"], day_idx, slot_idx)
                            if key in x:
                                teacher_vars.append(x[key])
                        if teacher_vars:
                            model.Add(sum(teacher_vars) <= 1)

            # Restrição 1b: professores com MESMO NOME não podem conflitar no mesmo slot.
            for _, grouped_ids in teacher_name_groups.items():
                if len(grouped_ids) <= 1:
                    continue
                for day_idx in range(len(day_labels)):
                    for slot_idx in slot_indices:
                        grouped_vars = []
                        for activity in normalized_activities:
                            if activity["teacherId"] not in grouped_ids:
                                continue
                            key = (activity["idx"], day_idx, slot_idx)
                            if key in x:
                                grouped_vars.append(x[key])
                        if grouped_vars:
                            model.Add(sum(grouped_vars) <= 1)

            # Restrição 2: turma em no máximo um professor por slot.
            for class_id in class_ids:
                for day_idx in range(len(day_labels)):
                    for slot_idx in slot_indices:
                        class_vars = []
                        for activity in normalized_activities:
                            if activity["classId"] != class_id:
                                continue
                            key = (activity["idx"], day_idx, slot_idx)
                            if key in x:
                                class_vars.append(x[key])
                        if class_vars:
                            model.Add(sum(class_vars) <= 1)

            # Restrição 2b: professor (por nome) não pode estar em slots sobrepostos no mesmo dia.
            for _, grouped_ids in teacher_name_groups.items():
                if not grouped_ids:
                    continue
                for day_idx in range(len(day_labels)):
                    for slot_i, slot_j in overlapping_slot_pairs:
                        overlap_vars = []
                        for activity in normalized_activities:
                            if activity["teacherId"] not in grouped_ids:
                                continue
                            key_i = (activity["idx"], day_idx, slot_i)
                            key_j = (activity["idx"], day_idx, slot_j)
                            if key_i in x:
                                overlap_vars.append(x[key_i])
                            if key_j in x:
                                overlap_vars.append(x[key_j])
                        if overlap_vars:
                            model.Add(sum(overlap_vars) <= 1)

            # Restrição 3: carga exata por atividade (matriz curricular sem agregação indevida).
            for activity in normalized_activities:
                a_idx = activity["idx"]
                model.Add(
                    sum(x[(a_idx, day_idx, slot_idx)] for day_idx, slot_idx in valid_positions[a_idx])
                    == activity["quantity"]
                )

            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = 8.0

            status = solver.Solve(model)

            if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                _to_json(
                    self,
                    422,
                    {
                        "error": "Não foi possível encontrar uma solução viável no tempo limite.",
                        "status": solver.StatusName(status),
                    },
                )
                return

            schedule = {}
            for activity in normalized_activities:
                a_idx = activity["idx"]
                class_id = activity["classId"]
                teacher_id = activity["teacherId"]
                subject_id = activity["subjectId"]

                for day_idx, slot_idx in valid_positions[a_idx]:
                    if solver.Value(x[(a_idx, day_idx, slot_idx)]) == 1:
                        day_label = day_labels[day_idx]
                        key = f"{class_id}-{day_label}-{slot_idx}"
                        schedule[key] = {
                            "classId": class_id,
                            "teacherId": teacher_id,
                            "subjectId": subject_id,
                            "dayIdx": day_idx,
                            "slotIdx": slot_idx,
                            "timeKey": f"{day_label}-{slot_idx}",
                        }

            # Verificação final de consistência antes de retornar sucesso.
            expected_counts = {}
            for activity in normalized_activities:
                a_key = f"{activity['classId']}::{activity['subjectId']}::{activity['teacherId']}"
                expected_counts[a_key] = expected_counts.get(a_key, 0) + activity["quantity"]

            allocated_counts = {}
            for entry in schedule.values():
                a_key = f"{entry['classId']}::{entry.get('subjectId')}::{entry['teacherId']}"
                allocated_counts[a_key] = allocated_counts.get(a_key, 0) + 1

            mismatches = []
            all_keys = set(expected_counts.keys()) | set(allocated_counts.keys())
            for a_key in all_keys:
                expected = expected_counts.get(a_key, 0)
                got = allocated_counts.get(a_key, 0)
                if expected != got:
                    mismatches.append(f"{a_key} ({got}/{expected})")

            if mismatches:
                _to_json(
                    self,
                    422,
                    {
                        "error": "Solução inconsistente com a matriz curricular.",
                        "details": "; ".join(mismatches[:6]),
                    },
                )
                return

            _to_json(self, 200, schedule)

        except json.JSONDecodeError:
            _to_json(self, 400, {"error": "JSON inválido."})
        except Exception as exc:
            _to_json(
                self,
                500,
                {
                    "error": "Falha interna ao gerar grade.",
                    "details": str(exc),
                    "trace": traceback.format_exc().splitlines()[-1],
                },
            )
