import { SessionUser } from "@variamosple/variamos-security";

export interface SessionInfoResponse {
  user: SessionUser;
  redirect?: string;
}
