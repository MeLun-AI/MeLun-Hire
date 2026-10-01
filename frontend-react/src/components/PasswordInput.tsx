import { InputHTMLAttributes, useState } from 'react';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function PasswordInput({ label, error, id, ...rest }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="mb-4 text-left">
      <label htmlFor={inputId} className="block text-sm text-gray-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          className={`w-full bg-white/10 border ${error ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-2.5 pr-11 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral-500/50 transition`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
          tabIndex={-1}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}