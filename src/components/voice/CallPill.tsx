import { useEffect, useState } from 'react';

interface CallPillProps {
  /** Whether the call is active */
  isActive: boolean;
  /** Call duration in seconds */
  duration: number;
  /** Callback when end call is pressed */
  onEndCall: () => void;
  /** Whether call is connecting */
  isConnecting?: boolean;
  /** Call quality indicator (0-1, 1 = excellent) */
  quality?: number;
  /** Position offset from bottom of screen */
  bottomOffset?: number;
}

/**
 * Floating call control pill that appears during voice calls
 * Shows call duration, quality indicator, and end call button
 */
export function CallPill({ 
  isActive, 
  duration, 
  onEndCall, 
  isConnecting = false,
  quality = 1,
  bottomOffset = 100 
}: CallPillProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  // Show/hide animation
  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
    } else {
      // Delay hiding for smooth animation
      const timeout = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isActive]);
  
  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get quality indicator
  const getQualityIndicator = () => {
    if (isConnecting) return { color: 'text-yellow-500', icon: 'fas fa-circle-notch fa-spin' };
    if (quality >= 0.8) return { color: 'text-green-500', icon: 'fas fa-signal' };
    if (quality >= 0.5) return { color: 'text-yellow-500', icon: 'fas fa-signal' };
    return { color: 'text-red-500', icon: 'fas fa-exclamation-triangle' };
  };
  
  const qualityInfo = getQualityIndicator();
  
  if (!isVisible) return null;
  
  return (
    <div 
      className={`fixed left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
        isActive ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ bottom: `${bottomOffset}px` }}
    >
      {/* Main Call Pill */}
      <div className="bg-black bg-opacity-90 backdrop-blur-sm text-white rounded-full px-6 py-3 shadow-2xl border border-gray-600">
        <div className="flex items-center space-x-4">
          {/* Call Status Icon */}
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              {isConnecting ? 'Đang kết nối...' : 'Cuộc gọi thoại'}
            </span>
          </div>
          
          {/* Duration */}
          <div className="text-lg font-mono font-semibold min-w-[3rem]">
            {formatDuration(duration)}
          </div>
          
          {/* Quality Indicator */}
          <div className="flex items-center">
            <i className={`${qualityInfo.icon} ${qualityInfo.color} text-sm`} />
          </div>
          
          {/* End Call Button */}
          <button
            onClick={onEndCall}
            className="bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors duration-200 active:scale-95"
            title="Kết thúc cuộc gọi"
          >
            <i className="fas fa-phone-slash text-sm" />
          </button>
        </div>
      </div>
      
      {/* Connection Quality Details (when poor) */}
      {quality < 0.5 && !isConnecting && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
          <div className="text-red-700 text-xs font-medium">
            <i className="fas fa-exclamation-triangle mr-1" />
            Chất lượng kết nối kém
          </div>
          <div className="text-red-600 text-xs mt-1">
            Kiểm tra kết nối mạng của bạn
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Simple call duration counter component
 */
export function CallDuration({ startTime, isActive }: { startTime: number; isActive: boolean }) {
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    if (!isActive) {
      setDuration(0);
      return;
    }
    
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTime, isActive]);
  
  if (!isActive || duration === 0) return null;
  
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  
  return (
    <span className="text-xs text-gray-500 font-mono">
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}

/**
 * Compact call controls for header integration
 */
export function CompactCallControls({ 
  isActive, 
  onEndCall, 
  duration,
  className = '' 
}: { 
  isActive: boolean; 
  onEndCall: () => void;
  duration: number;
  className?: string;
}) {
  if (!isActive) return null;
  
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Recording indicator */}
      <div className="flex items-center space-x-1">
        <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
        <span className="text-xs font-medium">{formatDuration(duration)}</span>
      </div>
      
      {/* End call button */}
      <button
        onClick={onEndCall}
        className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors duration-200 active:scale-95"
        title="Kết thúc"
      >
        <i className="fas fa-phone-slash text-xs" />
      </button>
    </div>
  );
}