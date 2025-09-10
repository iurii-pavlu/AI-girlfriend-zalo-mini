import { useEffect, useRef, useState } from 'react';

interface WaveformProps {
  /** Current RMS audio level (0-1) */
  level: number;
  /** Whether showing user or assistant waveform */
  type: 'user' | 'assistant';
  /** Whether currently active/speaking */
  isActive: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom color theme */
  color?: string;
}

/**
 * Real-time audio waveform visualization component
 * Shows animated bars representing audio levels for user/assistant
 */
export function Waveform({ level, type, isActive, size = 'md', color }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [bars, setBars] = useState<number[]>([]);
  
  // Configuration based on size
  const config = {
    sm: { width: 60, height: 24, barCount: 5, barWidth: 3, gap: 3 },
    md: { width: 80, height: 32, barCount: 7, barWidth: 4, gap: 3 },
    lg: { width: 120, height: 48, barCount: 10, barWidth: 4, gap: 4 }
  }[size];
  
  // Color scheme based on type
  const colors = {
    user: color || '#ec4899', // girlfriend-500
    assistant: color || '#8b5cf6' // purple-500
  };
  
  // Initialize bars array
  useEffect(() => {
    setBars(new Array(config.barCount).fill(0));
  }, [config.barCount]);
  
  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!isActive) {
        // Show static bars when inactive
        const inactiveHeight = config.height * 0.1;
        for (let i = 0; i < config.barCount; i++) {
          const x = i * (config.barWidth + config.gap);
          const y = (config.height - inactiveHeight) / 2;
          
          ctx.fillStyle = colors[type] + '30'; // 30% opacity
          ctx.fillRect(x, y, config.barWidth, inactiveHeight);
        }
      } else {
        // Animate bars based on audio level
        setBars(prev => {
          const newBars = [...prev];
          
          // Update a random selection of bars based on audio level
          for (let i = 0; i < config.barCount; i++) {
            const targetHeight = Math.random() * level * config.height;
            const currentHeight = newBars[i];
            
            // Smooth interpolation
            newBars[i] = currentHeight + (targetHeight - currentHeight) * 0.3;
          }
          
          // Draw bars
          for (let i = 0; i < config.barCount; i++) {
            const barHeight = Math.max(newBars[i], config.height * 0.1);
            const x = i * (config.barWidth + config.gap);
            const y = (config.height - barHeight) / 2;
            
            // Create gradient effect
            const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
            gradient.addColorStop(0, colors[type]);
            gradient.addColorStop(1, colors[type] + '80');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, config.barWidth, barHeight);
          }
          
          return newBars;
        });
      }
      
      if (isActive) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [level, type, isActive, config, colors]);
  
  return (
    <div className="flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={config.width}
        height={config.height}
        className="rounded-sm"
        style={{
          filter: isActive ? 'drop-shadow(0 0 4px currentColor)' : 'none',
          color: colors[type]
        }}
      />
    </div>
  );
}

/**
 * Simple pulsing ring indicator for when microphone is active
 */
export function MicPulseRing({ isActive, size = 'md' }: { isActive: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12', 
    lg: 'w-16 h-16'
  };
  
  if (!isActive) return null;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className={`${sizeClasses[size]} rounded-full border-2 border-girlfriend-400 animate-ping opacity-30`} />
      <div className={`${sizeClasses[size]} absolute rounded-full border border-girlfriend-300 animate-pulse`} />
    </div>
  );
}

/**
 * VU Meter for showing current audio levels
 */
export function VUMeter({ level, className = '' }: { level: number; className?: string }) {
  const segments = 10;
  const filledSegments = Math.floor(level * segments);
  
  return (
    <div className={`flex space-x-1 ${className}`}>
      {Array.from({ length: segments }, (_, i) => {
        const isActive = i < filledSegments;
        const intensity = i / segments;
        
        let bgColor = 'bg-gray-200';
        if (isActive) {
          if (intensity < 0.6) bgColor = 'bg-green-400';
          else if (intensity < 0.8) bgColor = 'bg-yellow-400';
          else bgColor = 'bg-red-400';
        }
        
        return (
          <div
            key={i}
            className={`w-1 h-4 rounded-sm transition-colors duration-75 ${bgColor}`}
          />
        );
      })}
    </div>
  );
}