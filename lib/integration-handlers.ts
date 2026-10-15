import * as r0 from '../app/api/control/route';
import * as r1 from '../app/api/cleaning/route';
import * as r2 from '../app/api/handovers/route';
import * as r3 from '../app/api/client-catalog/route';
import * as r4 from '../app/api/vehicles/route';
import * as r5 from '../app/api/people/route';
import * as r6 from '../app/api/occupancy/route';
import * as r7 from '../app/api/mobilizations/route';
import * as r8 from '../app/api/work-orders/route';
import * as r9 from '../app/api/service-providers/route';
import * as r10 from '../app/api/property-services/route';
import * as r11 from '../app/api/guest-requests/route';
import * as r12 from '../app/api/request-intakes/route';
import * as r13 from '../app/api/mural/route';
import * as r14 from '../app/api/property-furniture/route';
import * as r15 from '../app/api/property-inspections/route';
import * as r16 from '../app/api/property-location/route';
import * as r17 from '../app/api/property-front-photo/route';
import * as r18 from '../app/api/operations/route';
import * as r19 from '../app/api/corrections/route';
import * as r20 from '../app/api/archive/route';
import * as r21 from '../app/api/hub/route';
import * as r22 from '../app/api/today/route';
import * as r23 from '../app/api/dashboard-metrics/route';
import * as r24 from '../app/api/localities/cities/route';
import * as r25 from '../app/api/property-imports/route';
import * as r26 from '../app/api/occupancy/import/route';
import * as r27 from '../app/api/mobilization-item-photos/route';
import * as r28 from '../app/api/property-furniture-item-photos/route';
import * as r29 from '../app/api/equipment-photo/[id]/route';
import * as r30 from '../app/api/photos/[id]/route';
import * as r31 from '../app/api/cleaning/photos/[id]/route';
import * as r32 from '../app/api/handovers/[id]/property-details/route';
import * as r33 from '../app/api/people/photos/[id]/route';
import * as r34 from '../app/api/property-front-photo/[id]/route';
import * as r35 from '../app/api/work-order-photos/[id]/route';
import * as r36 from '../app/api/mobilization-photos/[id]/route';
import * as r37 from '../app/api/property-furniture-photos/[id]/route';
import * as r38 from '../app/api/property-inspection-photos/[id]/route';
import * as r39 from '../app/api/property-service-files/[id]/route';
import * as r40 from '../app/api/guest-request-photos/[id]/route';
import * as r41 from '../app/api/request-intake-files/[id]/route';
import * as r42 from '../app/api/mural/files/[id]/route';
export type IntegrationHandler=(request:Request,context:{params:Promise<{id:string}>})=>Promise<Response>;
export const integrationHandlers:Record<string,Partial<Record<'GET'|'POST',IntegrationHandler>>>={
  "control": r0,
  "cleaning": r1,
  "handovers": r2,
  "client-catalog": r3,
  "vehicles": r4,
  "people": r5,
  "occupancy": r6,
  "mobilizations": r7,
  "work-orders": r8,
  "service-providers": r9,
  "property-services": r10,
  "guest-requests": r11,
  "request-intakes": r12,
  "mural": r13,
  "property-furniture": r14,
  "property-inspections": r15,
  "property-location": r16,
  "property-front-photo": r17,
  "operations": r18,
  "corrections": r19,
  "archive": r20,
  "hub": r21,
  "today": r22,
  "dashboard-metrics": r23,
  "localities/cities": r24,
  "property-imports": r25,
  "occupancy/import": r26,
  "mobilization-item-photos": r27,
  "property-furniture-item-photos": r28,
  "equipment-photo/{id}": r29,
  "photos/{id}": r30,
  "cleaning/photos/{id}": r31,
  "handovers/{id}/property-details": r32,
  "people/photos/{id}": r33,
  "property-front-photo/{id}": r34,
  "work-order-photos/{id}": r35,
  "mobilization-photos/{id}": r36,
  "property-furniture-photos/{id}": r37,
  "property-inspection-photos/{id}": r38,
  "property-service-files/{id}": r39,
  "guest-request-photos/{id}": r40,
  "request-intake-files/{id}": r41,
  "mural/files/{id}": r42,
};
