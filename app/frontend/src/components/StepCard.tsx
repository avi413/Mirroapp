import { StepDescriptor } from '../types';
import clsx from 'clsx';

interface Props {
  step: StepDescriptor;
  index: number;
}

export const StepCard = ({ step, index }: Props) => (
  <div
    className={clsx(
      'rounded-3xl border border-white/10 p-6 backdrop-blur',
      step.future ? 'opacity-50' : 'bg-white/5'
    )}
  >
    <div className="text-sm uppercase text-white/60">Step {index + 1}</div>
    <h3 className="text-2xl font-semibold mt-2">{step.title}</h3>
    <p className="text-white/70 mt-2">{step.subtitle}</p>
    {step.cta && (
      <button className="mt-4 px-4 py-2 rounded-full bg-brand text-black text-sm font-semibold">
        {step.cta}
      </button>
    )}
    {step.future && (
      <span className="mt-4 inline-flex items-center text-xs font-semibold uppercase tracking-wide text-white/60">
        Coming soon
      </span>
    )}
  </div>
);
