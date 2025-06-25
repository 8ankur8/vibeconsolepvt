export interface InputEvent {
  type: 'dpad' | 'button' | 'swipe' | 'touch' | 'accelerometer';
  action: string;
  data: any;
  timestamp: number;
}

export interface ControllerInput {
  deviceId: string;
  deviceName: string;
  deviceType: 'phone' | 'console';
  input: InputEvent;
  webrtcMessage: boolean; // true if came via WebRTC, false if via Supabase
}

export interface InputMapping {
  deviceId: string;
  deviceName: string;
  inputType: string;
  mappedAction: string;
  isActive: boolean;
}

export class InputRouter {
  private inputMappings = new Map<string, InputMapping[]>();
  private deviceNames = new Map<string, string>();
  private inputHistory: ControllerInput[] = [];
  private maxHistorySize = 100;
  
  private onInputCallback?: (input: ControllerInput) => void;
  private onMappingChangeCallback?: (deviceId: string, mappings: InputMapping[]) => void;

  constructor(
    onInput?: (input: ControllerInput) => void,
    onMappingChange?: (deviceId: string, mappings: InputMapping[]) => void
  ) {
    this.onInputCallback = onInput;
    this.onMappingChangeCallback = onMappingChange;
  }

  // Register a device with its name for identification
  registerDevice(deviceId: string, deviceName: string, deviceType: 'phone' | 'console' = 'phone') {
    this.deviceNames.set(deviceId, deviceName);
    
    // Set up default input mappings for new devices
    if (!this.inputMappings.has(deviceId)) {
      const defaultMappings = this.createDefaultMappings(deviceId, deviceName, deviceType);
      this.inputMappings.set(deviceId, defaultMappings);
      this.onMappingChangeCallback?.(deviceId, defaultMappings);
    }
    
    console.log(`🎮 [InputRouter] Registered device: ${deviceName} (${deviceId.slice(-8)}) as ${deviceType}`);
  }

  // Create default input mappings for a device
  private createDefaultMappings(deviceId: string, deviceName: string, deviceType: 'phone' | 'console'): InputMapping[] {
    if (deviceType === 'console') {
      return []; // Console doesn't need input mappings
    }

    // Default phone controller mappings
    return [
      {
        deviceId,
        deviceName,
        inputType: 'dpad.up',
        mappedAction: 'move_up',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'dpad.down',
        mappedAction: 'move_down',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'dpad.left',
        mappedAction: 'move_left',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'dpad.right',
        mappedAction: 'move_right',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'button.a',
        mappedAction: 'select',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'button.b',
        mappedAction: 'cancel',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'swipe.up',
        mappedAction: 'scroll_up',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'swipe.down',
        mappedAction: 'scroll_down',
        isActive: true
      }
    ];
  }

  // ENHANCED: Process incoming WebRTC message with input data
  processWebRTCInput(deviceId: string, message: any): ControllerInput | null {
    const deviceName = this.deviceNames.get(deviceId) || 'Unknown Device';
    
    console.log(`📨 [InputRouter] Processing WebRTC input from ${deviceName} (${deviceId.slice(-8)}):`, message);

    try {
      // Handle different message types and extract input events
      let inputEvent: InputEvent | null = null;

      if (message.type === 'navigation' || message.type === 'game_data') {
        inputEvent = this.extractInputFromMessage(message);
      } else {
        console.log(`⚠️ [InputRouter] Unhandled WebRTC message type: ${message.type}`);
        return null;
      }

      if (!inputEvent) {
        console.log(`⚠️ [InputRouter] No input event extracted from message`);
        return null;
      }

      const controllerInput: ControllerInput = {
        deviceId,
        deviceName,
        deviceType: 'phone',
        input: inputEvent,
        webrtcMessage: true
      };

      this.addToHistory(controllerInput);
      this.onInputCallback?.(controllerInput);

      console.log(`✅ [InputRouter] Processed WebRTC input from ${deviceName}: ${inputEvent.type}.${inputEvent.action}`);
      return controllerInput;

    } catch (error) {
      console.error(`❌ [InputRouter] Error processing WebRTC input from ${deviceName}:`, error);
      return null;
    }
  }

  // ENHANCED: Extract input event from various message formats
  private extractInputFromMessage(message: any): InputEvent | null {
    const data = message.data;
    
    console.log(`🔍 [InputRouter] Extracting input from message data:`, data);
    
    // Handle AirConsole-style dpad input
    if (data?.dpad?.directionchange) {
      const { key, pressed } = data.dpad.directionchange;
      console.log(`🎮 [InputRouter] Extracted dpad input: ${key} (pressed: ${pressed})`);
      return {
        type: 'dpad',
        action: key,
        data: { pressed, direction: key },
        timestamp: message.timestamp || Date.now()
      };
    }

    // Handle button input
    if (data?.button) {
      const buttonName = Object.keys(data.button)[0];
      const buttonData = data.button[buttonName];
      console.log(`🎮 [InputRouter] Extracted button input: ${buttonName}`, buttonData);
      return {
        type: 'button',
        action: buttonName,
        data: buttonData,
        timestamp: message.timestamp || Date.now()
      };
    }

    // Handle swipe input
    if (data?.swipe) {
      console.log(`🎮 [InputRouter] Extracted swipe input:`, data.swipe);
      return {
        type: 'swipe',
        action: data.swipe.direction || 'unknown',
        data: data.swipe,
        timestamp: message.timestamp || Date.now()
      };
    }

    // Handle touch input
    if (data?.touch) {
      console.log(`🎮 [InputRouter] Extracted touch input:`, data.touch);
      return {
        type: 'touch',
        action: data.touch.action || 'tap',
        data: data.touch,
        timestamp: message.timestamp || Date.now()
      };
    }

    // Handle accelerometer input
    if (data?.accelerometer) {
      console.log(`🎮 [InputRouter] Extracted accelerometer input:`, data.accelerometer);
      return {
        type: 'accelerometer',
        action: 'motion',
        data: data.accelerometer,
        timestamp: message.timestamp || Date.now()
      };
    }

    console.log(`⚠️ [InputRouter] Unable to extract input from message data:`, data);
    return null;
  }

  // ENHANCED: Process Supabase fallback input (when WebRTC fails)
  processSupabaseInput(deviceId: string, inputData: any): ControllerInput | null {
    const deviceName = this.deviceNames.get(deviceId) || 'Unknown Device';
    
    console.log(`📡 [InputRouter] Processing Supabase fallback input from ${deviceName}:`, inputData);

    try {
      const inputEvent: InputEvent = {
        type: inputData.type || 'button',
        action: inputData.action || 'unknown',
        data: inputData.data || {},
        timestamp: inputData.timestamp || Date.now()
      };

      const controllerInput: ControllerInput = {
        deviceId,
        deviceName,
        deviceType: 'phone',
        input: inputEvent,
        webrtcMessage: false
      };

      this.addToHistory(controllerInput);
      this.onInputCallback?.(controllerInput);

      console.log(`✅ [InputRouter] Processed Supabase input from ${deviceName}: ${inputEvent.type}.${inputEvent.action}`);
      return controllerInput;

    } catch (error) {
      console.error(`❌ [InputRouter] Error processing Supabase input from ${deviceName}:`, error);
      return null;
    }
  }

  // Get mapped action for a device input
  getMappedAction(deviceId: string, inputType: string): string | null {
    const mappings = this.inputMappings.get(deviceId) || [];
    const mapping = mappings.find(m => m.inputType === inputType && m.isActive);
    return mapping?.mappedAction || null;
  }

  // Update input mapping for a device
  updateInputMapping(deviceId: string, inputType: string, mappedAction: string, isActive: boolean = true) {
    const mappings = this.inputMappings.get(deviceId) || [];
    const existingIndex = mappings.findIndex(m => m.inputType === inputType);
    
    const deviceName = this.deviceNames.get(deviceId) || 'Unknown Device';
    
    if (existingIndex >= 0) {
      mappings[existingIndex] = {
        ...mappings[existingIndex],
        mappedAction,
        isActive
      };
    } else {
      mappings.push({
        deviceId,
        deviceName,
        inputType,
        mappedAction,
        isActive
      });
    }
    
    this.inputMappings.set(deviceId, mappings);
    this.onMappingChangeCallback?.(deviceId, mappings);
    
    console.log(`🔄 [InputRouter] Updated input mapping for ${deviceName}: ${inputType} → ${mappedAction}`);
  }

  // Add input to history with size limit
  private addToHistory(input: ControllerInput) {
    this.inputHistory.unshift(input);
    if (this.inputHistory.length > this.maxHistorySize) {
      this.inputHistory = this.inputHistory.slice(0, this.maxHistorySize);
    }
  }

  // Get input history for debugging
  getInputHistory(deviceId?: string, limit: number = 20): ControllerInput[] {
    let history = this.inputHistory;
    
    if (deviceId) {
      history = history.filter(input => input.deviceId === deviceId);
    }
    
    return history.slice(0, limit);
  }

  // Get all registered devices
  getRegisteredDevices(): Array<{ deviceId: string; deviceName: string }> {
    return Array.from(this.deviceNames.entries()).map(([deviceId, deviceName]) => ({
      deviceId,
      deviceName
    }));
  }

  // Get input mappings for a device
  getInputMappings(deviceId: string): InputMapping[] {
    return this.inputMappings.get(deviceId) || [];
  }

  // Get input statistics
  getInputStats(deviceId?: string, timeRange: number = 60000): any {
    const now = Date.now();
    const cutoff = now - timeRange;
    
    let relevantInputs = this.inputHistory.filter(input => input.input.timestamp >= cutoff);
    
    if (deviceId) {
      relevantInputs = relevantInputs.filter(input => input.deviceId === deviceId);
    }

    const stats = {
      totalInputs: relevantInputs.length,
      webrtcInputs: relevantInputs.filter(i => i.webrtcMessage).length,
      supabaseInputs: relevantInputs.filter(i => !i.webrtcMessage).length,
      inputTypes: {} as Record<string, number>,
      deviceBreakdown: {} as Record<string, number>
    };

    relevantInputs.forEach(input => {
      const inputKey = `${input.input.type}.${input.input.action}`;
      stats.inputTypes[inputKey] = (stats.inputTypes[inputKey] || 0) + 1;
      stats.deviceBreakdown[input.deviceName] = (stats.deviceBreakdown[input.deviceName] || 0) + 1;
    });

    return stats;
  }

  // Unregister a device
  unregisterDevice(deviceId: string) {
    const deviceName = this.deviceNames.get(deviceId);
    this.deviceNames.delete(deviceId);
    this.inputMappings.delete(deviceId);
    
    // Remove from history
    this.inputHistory = this.inputHistory.filter(input => input.deviceId !== deviceId);
    
    console.log(`🗑️ [InputRouter] Unregistered device: ${deviceName} (${deviceId.slice(-8)})`);
  }

  // Clear all data
  clear() {
    this.deviceNames.clear();
    this.inputMappings.clear();
    this.inputHistory = [];
    console.log('🧹 [InputRouter] Cleared all input router data');
  }
}