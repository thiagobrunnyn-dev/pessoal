import {propertyLevelLabel,propertyCapacityDiffers} from '../../lib/property-capacity';
import {propertyCountLabel} from '../../lib/property-details';
export default function PropertyCapacitySummary({data}:{data:{property_level?:unknown;declared_slots?:number|null;confirmed_room_capacity?:number|null}}) {
 return <><dl className="property-characteristics"><div><dt>Nível</dt><dd>{propertyLevelLabel(data.property_level)}</dd></div><div><dt>Total de vagas declaradas</dt><dd>{propertyCountLabel(data.declared_slots)}</dd></div><div><dt>Capacidade confirmada dos quartos</dt><dd>{propertyCountLabel(data.confirmed_room_capacity)}</dd></div></dl>{propertyCapacityDiffers(data.declared_slots,data.confirmed_room_capacity)&&<p className="inline-note" role="status">O total declarado difere da capacidade confirmada dos quartos. Confira os cadastros; a ocupação não foi alterada.</p>}</>;
}
