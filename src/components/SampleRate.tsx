import React from 'react';

export interface SampleRateProps { favorable: number; unfavorable: number; }
export const SampleRate: React.FC<SampleRateProps> = ({ favorable, unfavorable }) => {
  const n = favorable + unfavorable;
  if (n < 200) return <span>N = {n}, INCONCLUSIVE</span>;
  return <span>{((favorable / n) * 100).toFixed(1)}% (N = {n})</span>;
};
