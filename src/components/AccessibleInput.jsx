import React from 'react';

/**
 * Input acessível com label e suporte a aria-label
 */
const AccessibleInput = ({ 
  id, 
  label, 
  value, 
  onChange, 
  placeholder, 
  onKeyDown,
  autoFocus = false,
  type = 'text',
  className = '',
  showLabel = false
}) => {
  const baseClasses = 'border p-2 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  
  return (
    <div className="flex flex-col flex-1">
      <label 
        htmlFor={id} 
        className={showLabel ? 'text-xs font-semibold text-slate-600 mb-1' : 'sr-only'}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={label}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className={`${baseClasses} ${className}`}
      />
    </div>
  );
};

export default AccessibleInput;
