export type MailMessage = { to: string; subject: string; text: string; html: string };
export type MailTransport = (msg: MailMessage & { from: string }) => Promise<void>;
