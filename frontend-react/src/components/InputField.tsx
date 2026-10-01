import { InputHTMLAttributes } from 'react';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function InputField({ label, error, id, ...rest }: InputFieldProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="mb-4 text-left">
      <label htmlFor={inputId} className="block text-sm text-gray-300 mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full bg-white/10 border ${error ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral-500/50 transition`}
        {...rest}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}