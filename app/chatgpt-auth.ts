import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  passwordSession?: boolean;
  passwordSessionRevision?: number;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";
const PASSWORD_SIGN_IN_PATH = "/entrar";
const PASSWORD_SESSION_PATH = "/api/password-session";
const PASSWORD_SESSION_HEADER = "x-mobiliza-password-session";
const PASSWORD_REVISION_HEADER = "x-mobiliza-password-member-revision";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;
  const passwordSession = requestHeaders.get(PASSWORD_SESSION_HEADER) === "1";
  const revisionValue = requestHeaders.get(PASSWORD_REVISION_HEADER);
  const revision = revisionValue && /^\d+$/.test(revisionValue) ? Number(revisionValue) : NaN;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
    ...(passwordSession ? {passwordSession, passwordSessionRevision: Number.isSafeInteger(revision) ? revision : undefined} : {}),
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(managementSignInPath(returnTo));
}

export function managementSignInPath(returnTo: string): string {
  if (env.MOBILIZA_SUPABASE_AUTH !== "1") return chatGPTSignInPath(returnTo);
  return `${PASSWORD_SIGN_IN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local" || url.pathname.startsWith("//")) return "/";
  if (isReservedAuthPath(url.pathname.replace(/\/+$/, ""))) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH ||
    pathname === PASSWORD_SIGN_IN_PATH ||
    pathname === PASSWORD_SESSION_PATH ||
    pathname === PASSWORD_SESSION_PATH + "/logout"
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
