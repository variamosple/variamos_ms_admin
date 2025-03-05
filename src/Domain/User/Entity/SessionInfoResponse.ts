import { SessionUser } from "@variamosple/variamos-security";

export interface SessionInfoResponse {
  user: SessionUser;
  authToken?: string;
  redirect?: string;
}
