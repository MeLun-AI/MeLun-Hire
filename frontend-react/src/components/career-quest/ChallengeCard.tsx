import { motion } from 'framer-motion';
import { AppIcon } from '../applicant/ApplicantIcons';
import type { ChallengeMeta } from '../../services/careerQuest';

function difficultyTone(difficulty: string): string {
  if (difficulty === 'easy') return 'bg-green-500/10 text-green-400 border border-green-500/30';
  if (difficulty === 'hard') return 'bg-red-500/10 text-red-400 border border-red-500/30';
  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30';
}

export function ChallengeCard({
  challenge,
  onOpen,
}: {
  challenge: ChallengeMeta;
  onOpen: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="text-left bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] hover:border-white/20 transition-all card-hover btn-lift"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary-light truncate">{challenge.category}</span>
        {challenge.completed && <AppIcon name="check" className="w-4 h-4 text-green-400" />}
      </div>

      <p className="text-base font-bold text-white">{challenge.title}</p>
      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{challenge.description}</p>

      <div className="flex flex-wrap gap-2 mt-3">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">{challenge.skill}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${difficultyTone(challenge.difficulty)}`}>{challenge.difficulty}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-400 border border-white/10">
          {Math.max(1, Math.round(challenge.estimated_time / 60))} min
        </span>
      </div>
    </motion.button>
  );
}