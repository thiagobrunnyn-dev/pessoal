import {getChatGPTUser,requireChatGPTUser} from '../app/chatgpt-auth';
import {notFound} from 'next/navigation';
// Stable Sites principal verified from owner-created data while the platform audience was owner-only.
// This is not a credential. Never infer ownership from an email, visitor input, or first caller.
export const SITE_OWNER_ID='CONFIGURE_VERIFIED_SITE_OWNER_ID';
export async function getOwnerUser(){const user=await getChatGPTUser();return user?.userId===SITE_OWNER_ID?user:null;}
export async function requireOwnerUser(returnTo:string){const user=await requireChatGPTUser(returnTo);if(user.userId!==SITE_OWNER_ID)notFound();return user;}
