import { useState } from "react";

interface Props {
  scheduleId: string;
}

export default function DeleteScheduleButton({ scheduleId }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <form method="POST" action={`/api/schedules/${scheduleId}`} className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
        >
          Tak, usuń
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
          }}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10"
        >
          Anuluj
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setConfirming(true);
      }}
      className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
    >
      Usuń harmonogram
    </button>
  );
}
