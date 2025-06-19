import React from 'react';
import { Wifi, WifiOff, Activity, AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react';

interface WebRTCDebugPanelProps {
  status: {
    isInitialized: boolean;
    connections: Record<string, RTCPeerConnectionState>;
    dataChannels: Record<string, RTCDataChannelState | 'none'>;
    connectedDevices: string[];
    lastError?: string;
  };
  deviceNames?: Record<string, string>;
  onConnectToDevice?: (deviceId: string) => void;
  className?: string;
  getDetailedStatus?: () => any;
}

const WebRTCDebugPanel: React.FC<WebRTCDebugPanelProps> = ({ 
  status, 
  deviceNames = {}, 
  onConnectToDevice,
  className = '',
  getDetailedStatus
}) => {
  const getConnectionIcon = (state: RTCPeerConnectionState) => {
    switch (state) {
      case 'connected':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'connecting':
        return <Clock size={16} className="text-yellow-400 animate-spin" />;
      case 'disconnected':
        return <WifiOff size={16} className="text-orange-400" />;
      case 'failed':
        return <WifiOff size={16} className="text-red-400" />;
      case 'closed':
        return <WifiOff size={16} className="text-gray-400" />;
      default:
        return <Activity size={16} className="text-gray-400" />;
    }
  };

  const getDataChannelIcon = (state: RTCDataChannelState | 'none') => {
    switch (state) {
      case 'open':
        return <Wifi size={16} className="text-green-400" />;
      case 'connecting':
        return <Clock size={16} className="text-yellow-400" />;
      case 'closed':
      case 'closing':
        return <WifiOff size={16} className="text-red-400" />;
      default:
        return <Activity size={16} className="text-gray-400" />;
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'connected':
      case 'open':
        return 'text-green-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'disconnected':
        return 'text-orange-400';
      case 'failed':
      case 'closed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const detailedStatus = getDetailedStatus ? getDetailedStatus() : {};

  return (
    <div className={`bg-gray-800/50 rounded-lg p-4 border border-gray-700 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Activity size={20} className="text-indigo-400" />
        <h3 className="font-semibold text-white">WebRTC Debug Panel</h3>
        <div className={`w-2 h-2 rounded-full ${
          status.isInitialized ? 'bg-green-400 animate-pulse' : 'bg-red-400'
        }`}></div>
      </div>

      {/* Overall Status */}
      <div className="mb-4 p-3 bg-gray-900/50 rounded border border-gray-600">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Initialized:</span>
            <span className={status.isInitialized ? 'text-green-400' : 'text-red-400'}>
              {status.isInitialized ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Connected:</span>
            <span className="text-indigo-400">{status.connectedDevices.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total Peers:</span>
            <span className="text-blue-400">{Object.keys(status.connections).length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Open Channels:</span>
            <span className="text-green-400">
              {Object.values(status.dataChannels).filter(state => state === 'open').length}
            </span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {status.lastError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded">
          <div className="flex items-center gap-2 text-red-300">
            <AlertCircle size={16} />
            <span className="text-sm">{status.lastError}</span>
          </div>
        </div>
      )}

      {/* Connection Details */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Peer Connections</h4>
        
        {Object.keys(status.connections).length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            No peer connections
          </div>
        ) : (
          Object.entries(status.connections).map(([deviceId, connectionState]) => {
            const dataChannelState = status.dataChannels[deviceId] || 'none';
            const deviceName = deviceNames[deviceId] || deviceId.slice(-8);
            const details = detailedStatus[deviceId] || {};
            
            return (
              <div key={deviceId} className="p-3 bg-gray-900/30 rounded border border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white text-sm">{deviceName}</span>
                  <div className="flex items-center gap-2">
                    {onConnectToDevice && connectionState !== 'connected' && (
                      <button
                        onClick={() => onConnectToDevice(deviceId)}
                        className="px-2 py-1 bg-indigo-500 hover:bg-indigo-600 rounded text-xs text-white transition-colors flex items-center gap-1"
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Connection:</span>
                    <div className="flex items-center gap-1">
                      {getConnectionIcon(connectionState)}
                      <span className={getStateColor(connectionState)}>
                        {connectionState}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Data Channel:</span>
                    <div className="flex items-center gap-1">
                      {getDataChannelIcon(dataChannelState)}
                      <span className={getStateColor(dataChannelState)}>
                        {dataChannelState}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detailed Status */}
                {details && (
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 border-t border-gray-700 pt-2">
                    <div className="flex justify-between">
                      <span>ICE:</span>
                      <span className={getStateColor(details.iceConnectionState || 'unknown')}>
                        {details.iceConnectionState || 'unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gathering:</span>
                      <span className={getStateColor(details.iceGatheringState || 'unknown')}>
                        {details.iceGatheringState || 'unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Local SDP:</span>
                      <span className={details.localDescription ? 'text-green-400' : 'text-red-400'}>
                        {details.localDescription ? 'Set' : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Remote SDP:</span>
                      <span className={details.remoteDescription ? 'text-green-400' : 'text-red-400'}>
                        {details.remoteDescription ? 'Set' : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Role:</span>
                      <span className="text-blue-400">
                        {details.isInitiator ? 'Initiator' : 'Receiver'}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="mt-2 text-xs text-gray-500 font-mono">
                  ID: {deviceId.slice(-12)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Performance Metrics */}
      <div className="mt-4 pt-3 border-t border-gray-600">
        <div className="grid grid-cols-4 gap-4 text-xs text-center">
          <div>
            <div className="text-gray-400">Total</div>
            <div className="text-white font-bold">{Object.keys(status.connections).length}</div>
          </div>
          <div>
            <div className="text-gray-400">Connected</div>
            <div className="text-green-400 font-bold">{status.connectedDevices.length}</div>
          </div>
          <div>
            <div className="text-gray-400">Channels</div>
            <div className="text-indigo-400 font-bold">
              {Object.values(status.dataChannels).filter(state => state === 'open').length}
            </div>
          </div>
          <div>
            <div className="text-gray-400">Failed</div>
            <div className="text-red-400 font-bold">
              {Object.values(status.connections).filter(state => state === 'failed').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebRTCDebugPanel;