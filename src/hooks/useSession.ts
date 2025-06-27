import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { generateLobbyCode, generateQRCode } from '../lib/utils';

interface Player {
  id: string;
  name: string;
  deviceType: string;
  isHost: boolean;
  joinedAt: number;
  status: string;
}

interface UseSessionReturn {
  sessionId: string;
  consoleDeviceId: string;
  lobbyCode: string;
  qrCodeData: string;
  connectionUrl: string;
  players: Player[];
  isLobbyLocked: boolean;
  isCreatingSession: boolean;
  error: string | null;
  createSession: () => Promise<void>;
  lockLobby: () => Promise<void>;
  unlockLobby: () => Promise<void>;
}

export const useSession = (): UseSessionReturn => {
  const [sessionId, setSessionId] = useState<string>('');
  const [consoleDeviceId, setConsoleDeviceId] = useState<string>('');
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [connectionUrl, setConnectionUrl] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLobbyLocked, setIsLobbyLocked] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data: devices, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .order('connected_at', { ascending: true });

      if (error) {
        console.error('Error loading devices:', error);
        return;
      }

      const mappedPlayers: Player[] = devices.map((device) => ({
        id: device.id,
        name: device.name,
        deviceType: device.name === 'Console' ? 'console' : 'phone',
        isHost: device.is_leader || false,
        joinedAt: new Date(device.connected_at || '').getTime(),
        status: 'connected'
      }));

      setPlayers(mappedPlayers);
    } catch (error) {
      console.error('Error loading devices:', error);
      setError('Failed to load players');
    }
  }, [sessionId]);

  const loadSessionStatus = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('is_locked, selected_editor')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('Error loading session status:', error);
        return;
      }

      setIsLobbyLocked(session.is_locked || false);
    } catch (error) {
      console.error('Error loading session status:', error);
      setError('Failed to load session status');
    }
  }, [sessionId]);

  const createSession = useCallback(async () => {
    try {
      setIsCreatingSession(true);
      setError(null);
      
      const code = generateLobbyCode();
      const baseUrl = window.location.origin;
      const connectionUrl = `${baseUrl}/controller?lobby=${code}`;
      
      // Create session
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          code,
          is_active: true,
          is_locked: false,
          selected_editor: null
        })
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

      // Create console device
      const { data: consoleDevice, error: deviceError } = await supabase
        .from('devices')
        .insert({
          session_id: session.id,
          name: 'Console',
          is_leader: true
        })
        .select()
        .single();

      if (deviceError) {
        throw new Error(`Failed to create console device: ${deviceError.message}`);
      }

      // Generate QR code
      const qrCode = await generateQRCode(connectionUrl);

      // Update state
      setSessionId(session.id);
      setConsoleDeviceId(consoleDevice.id);
      setLobbyCode(code);
      setConnectionUrl(connectionUrl);
      setQrCodeData(qrCode);
      
      console.log('Session created successfully:', {
        sessionId: session.id,
        consoleDeviceId: consoleDevice.id,
        lobbyCode: code
      });
    } catch (error) {
      console.error('Error creating session:', error);
      setError(error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setIsCreatingSession(false);
    }
  }, []);

  const lockLobby = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_locked: true })
        .eq('id', sessionId);

      if (error) {
        throw new Error(`Failed to lock lobby: ${error.message}`);
      }

      setIsLobbyLocked(true);
    } catch (error) {
      console.error('Error locking lobby:', error);
      setError(error instanceof Error ? error.message : 'Failed to lock lobby');
    }
  }, [sessionId]);

  const unlockLobby = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_locked: false })
        .eq('id', sessionId);

      if (error) {
        throw new Error(`Failed to unlock lobby: ${error.message}`);
      }

      setIsLobbyLocked(false);
    } catch (error) {
      console.error('Error unlocking lobby:', error);
      setError(error instanceof Error ? error.message : 'Failed to unlock lobby');
    }
  }, [sessionId]);

  // Load data when session changes
  useEffect(() => {
    if (sessionId) {
      loadDevices();
      loadSessionStatus();
    }
  }, [sessionId, loadDevices, loadSessionStatus]);

  return {
    sessionId,
    consoleDeviceId,
    lobbyCode,
    qrCodeData,
    connectionUrl,
    players,
    isLobbyLocked,
    isCreatingSession,
    error,
    createSession,
    lockLobby,
    unlockLobby
  };
};