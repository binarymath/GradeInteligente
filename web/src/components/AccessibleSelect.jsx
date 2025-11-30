import React from 'react';

/**
 * Select acessível com label e suporte a aria-label
 */
const AccessibleSelect = ({ 
  id, 
  label, 
  value, 
  onChange, 
  options = [],
  className = '',
  showLabel = false
}) => {
  const baseClasses = 'border p-2 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  
  return (
    <div className="flex flex-col">
      <label 
        htmlFor={id} 
        className={showLabel ? 'text-xs font-semibold text-slate-600 mb-1' : 'sr-only'}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        aria-label={label}
        className={`${baseClasses} ${className}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default AccessibleSelect;
