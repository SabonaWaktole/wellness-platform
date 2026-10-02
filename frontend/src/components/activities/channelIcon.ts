import { FileText, Mail, MapPin, MonitorPlay, PhoneCall, Video, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  CALL: PhoneCall,
  EMAIL: Mail,
  VISIT: MapPin,
  MEETING: Video,
  ONLINE_MEETING: MonitorPlay,
  NOTE: FileText,
};

/** One icon per activity type (FR-ACT-01), the same in the dialog, the timeline and the deal page. */
export const channelIcon = (channel: string): LucideIcon => ICONS[channel] ?? FileText;
