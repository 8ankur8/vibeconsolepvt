import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Mic, Folder, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { deviceInputHelpers } from '../lib/supabase';

interface EditorControlPanelProps {
  sessionId: string;
  myPlayerId: string;
  playerName: string;
  webrtcStatus: any;
  webrtcSendMessage: (targetDeviceId: string, message: any) => boolean;
  onBack: () => void;
}

const EditorControlPanel: React.FC<EditorControlPanelProps> = ({
  sessionId,
  myPlayerId,
  playerName,
  webrtcStatus,
  webrtcSendMessage,
  onBack
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Set drawing style
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas with dark background
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Send input to console via WebRTC or Supabase fallback
  const sendInputToConsole = async (inputType: 'dpad' | 'button' | 'voice' | 'canvas', inputAction: string, inputData: any = {}) => {
    console.log(`🎮 [EDITOR_CONTROL] Sending ${inputType}.${inputAction}:`, inputData);

    try {
      // Try WebRTC first
      let webrtcSent = false;
      if (webrtcStatus?.isInitialized) {
        // Find console device
        const consoleDeviceId = Object.keys(webrtcStatus.connections).find(deviceId => 
          webrtcStatus.connections[deviceId] === 'connected'
        );

        if (consoleDeviceId) {
          const webrtcMessage = {
            type: 'game_data' as const,
            data: {
              [inputType]: {
                [inputAction]: inputData
              }
            }
          };

          webrtcSent = webrtcSendMessage(consoleDeviceId, webrtcMessage);
          console.log(`📡 [EDITOR_CONTROL] WebRTC sent:`, webrtcSent);
        }
      }

      // Store in device_inputs table
      const inputCreated = await deviceInputHelpers.createDeviceInput(
        sessionId,
        myPlayerId,
        inputType,
        inputAction,
        {
          ...inputData,
          playerName: playerName,
          timestamp: Date.now()
        },
        webrtcSent ? 'webrtc' : 'supabase'
      );

      if (inputCreated) {
        console.log(`✅ [EDITOR_CONTROL] Input stored successfully`);
      }

    } catch (error) {
      console.error(`❌ [EDITOR_CONTROL] Error sending input:`, error);
    }
  };

  // D-pad navigation handlers
  const handleDpadPress = (direction: string) => {
    sendInputToConsole('dpad', direction, { pressed: true, direction });
  };

  // Canvas drawing handlers
  const getCanvasPosition = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getCanvasPosition(e);
    setIsDrawing(true);
    setLastPosition(pos);

    // Send canvas start event
    sendInputToConsole('canvas', 'draw_start', { x: pos.x, y: pos.y });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pos = getCanvasPosition(e);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(lastPosition.x, lastPosition.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    // Send canvas draw event
    sendInputToConsole('canvas', 'draw_move', {
      from: lastPosition,
      to: pos,
      color: '#8B5CF6',
      lineWidth: 3
    });

    setLastPosition(pos);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Send canvas end event
    sendInputToConsole('canvas', 'draw_end', { timestamp: Date.now() });
  };

  // Clear canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = '#1F2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Send canvas clear event
    sendInputToConsole('canvas', 'clear', { timestamp: Date.now() });
  };

  // Voice recording handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(prev => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        
        // Convert to base64 for transmission
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          sendInputToConsole('voice', 'recording', {
            audio: base64Audio,
            duration: Date.now() - recordingStartTime,
            format: 'audio/wav'
          });
        };
        reader.readAsDataURL(audioBlob);

        // Clean up
        stream.getTracks().forEach(track => track.stop());
        setAudioChunks([]);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);

      // Send voice start event
      const recordingStartTime = Date.now();
      sendInputToConsole('voice', 'start', { timestamp: recordingStartTime });

    } catch (error) {
      console.error('❌ [EDITOR_CONTROL] Error starting voice recording:', error);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);

      // Send voice stop event
      sendInputToConsole('voice', 'stop', { timestamp: Date.now() });
    }
  };

  // File/folder action
  const handleFolderAction = () => {
    sendInputToConsole('button', 'folder', { action: 'open_files', timestamp: Date.now() });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-gray-800 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        

        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
          <div className="w-3 h-3 bg-white rounded-full"></div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 mb-4 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-2/3 bg-gray-800 rounded-lg border-4 border-purple-600 touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        
        {/* Canvas Instructions */}
        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1">
          <p className="text-xs text-purple-300">Draw here to send to console</p>
        </div>

        {/* Clear Canvas Button */}
        <button
          onClick={clearCanvas}
          className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 p-2 rounded-lg transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Control Panel */}
      <div className="grid grid-cols-3 gap- items-end">
        {/* D-Pad */}
        <div className="fixed left-[20%] bottom-[10%] w-36 h-36 mx-auto">
          <div className="absolute inset-0 bg-gray-800 rounded-full border-4 border-gray-700">
            {/* Up */}
            <button 
              onClick={() => handleDpadPress('up')}
              className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-12  bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronUp size={16} className="text-white" />
            </button>

            {/* Down */}
            <button 
              onClick={() => handleDpadPress('down')}
              className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-12  bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronDown size={16} className="text-white" />
            </button>

            {/* Left */}
            <button 
              onClick={() => handleDpadPress('left')}
              className="absolute left-0 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={16} className="text-white" />
            </button>

            {/* Right */}
            <button 
              onClick={() => handleDpadPress('right')}
              className="absolute right-0 top-1/2 transform -translate-y-1/2 w-12 h-12  bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronRight size={16} className="text-white" />
            </button>

            {/* Center */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-gray-600 rounded-full"></div>
          </div>
        </div>

        {/* Voice Button */}
        <div className="fixed right-[30%] bottom-[10%] justify-center">
          <button
            onMouseDown={startVoiceRecording}
            onMouseUp={stopVoiceRecording}
            onTouchStart={startVoiceRecording}
            onTouchEnd={stopVoiceRecording}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording 
                ? 'bg-red-500 scale-110 animate-pulse' 
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <Mic size={24} className={isRecording ? 'text-white' : 'text-gray-300'} />
          </button>
        </div>

        {/* Folder Button */}
        <div className="fixed right-[10%] bottom-[20%] justify-center">
          <button
            onClick={handleFolderAction}
            className="w-20 h-20 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center transition-colors"
          >
            <Folder size={24} className="text-gray-300" />
          </button>
        </div>
      </div>

    </div>
  );
};

export default EditorControlPanel;