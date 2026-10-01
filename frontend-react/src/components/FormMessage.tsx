interface FormMessageProps {
  type: 'success' | 'error';
  message: string;
}

export default function FormMessage({ type, message }: FormMessageProps) {
  if (!message) return null;

  const colorClass =
    type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400';

  return (
    <div className={`${colorClass} border rounded-xl px-4 py-3 text-sm text-left mb-4`}>
      {message}
    </div>
  );
}