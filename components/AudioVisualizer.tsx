import React from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  className?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, className = "" }) => {
  if (!isActive) return null;

  return (
    <div className={`flex items-center gap-0.5 h-4 ${className}`}>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="w-1 bg-[#79B8FF] rounded-full animate-waveform"
          style={{
            animationDelay: `${i * 0.15}s`,
            height: '100%',
          }}
        />
      ))}
      <style>{`
        @keyframes waveform {
          0%, 100% { height: 25%; }
          50% { height: 100%; }
        }
        .animate-waveform {
          animation: waveform 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default AudioVisualizer;
