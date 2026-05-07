export type QboTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  x_refresh_token_expires_in?: number;
  token_type: string;
};

export { getQboAccessToken as getAccessTokenFromRefresh, getQboRealmId as getRealmId } from "../../lib/business/qbo";
