import { useState } from 'react';

export const useManualState = () => {
    const [editMode, setEditMode] = useState(false);
    const [selectedCell, setSelectedCell] = useState(null); // { dayIdx, slotIdx, classId }
    const [showAddModal, setShowAddModal] = useState(false);
    const [resolveModal, setResolveModal] = useState(null); // { item, suggestions: [] } se aberto
    const [manualLog, setManualLog] = useState([]); // Log simples para operações manuais
    const [printingClass, setPrintingClass] = useState(null);

    return {
        editMode, setEditMode,
        selectedCell, setSelectedCell,
        showAddModal, setShowAddModal,
        resolveModal, setResolveModal,
        manualLog, setManualLog,
        printingClass, setPrintingClass
    };
};
