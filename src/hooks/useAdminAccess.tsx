import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// Set to false for production - admin check is enabled
const BYPASS_ADMIN_CHECK = false;

interface AdminStatus {
  isAdmin: boolean;
  loading: boolean;
}

export const useAdminAccess = (): AdminStatus => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(BYPASS_ADMIN_CHECK);
  const [loading, setLoading] = useState(!BYPASS_ADMIN_CHECK);
  const checkedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip check if bypassing
    if (BYPASS_ADMIN_CHECK) {
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    const checkAdminStatus = async () => {
      if (authLoading) return;
      
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        checkedUserIdRef.current = null;
        return;
      }

      // Skip if we've already checked this user
      if (checkedUserIdRef.current === user.id) {
        return;
      }

      setLoading(true);
      
      try {
        const { data, error } = await supabase.rpc('is_admin', { check_user_id: user.id });
        
        if (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(data === true);
        }
        checkedUserIdRef.current = user.id;
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, authLoading]);

  return { isAdmin, loading: loading || authLoading };
};
