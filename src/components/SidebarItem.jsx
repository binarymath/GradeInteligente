import React from 'react';

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 border-l-4 ${
      active 
        ? 'bg-blue-50 text-blue-700 border-blue-600 bg-blue-50/50' 
        : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'
    }`}
  >
    <Icon size={18} className="shrink-0" />
    <span className="truncate">{label}</span>
  </button>
);

export default SidebarItem;
