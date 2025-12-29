import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, WifiOff, KeyRound, CreditCard, RefreshCw, Settings } from 'lucide-react';
import { ApiErrorDescriptor, ApiErrorKind } from '@/lib/apiErrors';

interface ApiErrorDialogProps {
  error: ApiErrorDescriptor | null;
  open: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

function getIcon(kind: ApiErrorKind) {
  switch (kind) {
    case 'quota':
    case 'rate_limited':
      return <CreditCard className="w-6 h-6 text-warning" />;
    case 'invalid_key':
    case 'key_suspended':
    case 'permission_denied':
      return <KeyRound className="w-6 h-6 text-destructive" />;
    case 'network':
      return <WifiOff className="w-6 h-6 text-muted-foreground" />;
    default:
      return <AlertTriangle className="w-6 h-6 text-warning" />;
  }
}

export function ApiErrorDialog({ error, open, onClose, onRetry }: ApiErrorDialogProps) {
  const navigate = useNavigate();

  if (!error) return null;

  const showRetry = error.kind === 'rate_limited' || error.kind === 'network';
  const showSettings = error.kind === 'quota' || error.kind === 'invalid_key' || error.kind === 'key_suspended' || error.kind === 'permission_denied';

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {getIcon(error.kind)}
            <AlertDialogTitle>{error.title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left">
            {error.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>Close</AlertDialogCancel>
          {showRetry && onRetry && (
            <AlertDialogAction onClick={onRetry} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Try Again
            </AlertDialogAction>
          )}
          {showSettings && (
            <AlertDialogAction onClick={() => { navigate('/settings'); onClose(); }} className="gap-2">
              <Settings className="w-4 h-4" />
              Open Settings
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
