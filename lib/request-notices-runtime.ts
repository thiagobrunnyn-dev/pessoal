// Request notices bound to the Worker's D1 database. The request modules call queueReceived and
// queueClosed right after an action is saved; both log their own failures and never throw.
import {db} from './maintenance';
import {createRequestNotices} from './request-notices-api';
export const requestNotices = createRequestNotices({db});
