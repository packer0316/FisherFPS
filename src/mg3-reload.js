import * as T from 'three';
import { reloadHand } from './reload-hand.js';

const v = (x, y, z) => new T.Vector3(x, y, z);

export function makeMachineReload(rig, lid, box, bolt, beltMesh, feedPath) {
  const lead = new T.Object3D(), boxHome = box.position.clone();
  const l = reloadHand(rig, 'L'), r = reloadHand(rig, 'R');
  const latch = l.place(l.hook, v(-.083,.015,.349), v(.35,.48,-.84), v(.96,-.12,.14), lid);
  const lift = l.place(l.hook, latch.point, v(.25,.72,-.62), v(.98,-.14,.04), lid);
  const carry = l.place(l.bake('handle', [.76,1.76,2.62]), v(-.016,.151,.113), v(.30,-.16,-.94), v(.22,-.96,.12), box, true);
  const belt = l.place(l.bake('pinch', [.48,.99,1.54]), v(), v(.44,.13,-.89), v(.62,-.75,.01), lead);
  const press = l.bake('press', [.14,.39,.62]);
  const cap = l.place(press, v(-.070,.054,.316), v(.24,.81,-.53), v(.77,-.05,.64), lid);
  const closed = l.place(press, cap.point, v(.36,.13,-.92), v(.22,-.97,-.07), lid);
  const charging = r.place(r.hook, v(.121,.031,-.35), v(-.21,.26,-.94), v(-.96,-.22,.10), bolt);

  // During holds the socket moves under the fingers. The transfer arcs clear the receiver and links.
  const catchLid = .075, lidUp = .18, catchOldLead = .246, oldLeadClear = .295;
  const boxFree = .33, boxOut = .42, boxIn = .452, boxSeated = .565;
  const catchNewLead = .615, leadSeated = .685, palmOnLid = .733, lidDown = .791;
  const catchBolt = .906, boltHome = .957;
  const open = [[0, l.rest], [catchLid, latch, v(-.125,.040,.034)], [lidUp, lift]];
  const finish = [[boxSeated, carry],
    [catchNewLead, belt, v(-.068,.077,-.012)], [leadSeated, belt],
    [palmOnLid, cap, v(-.085,.038,.025)], [lidDown, closed],
    [.85, l.rest, v(-.14,.037,-.012)]];
  const emptyBox = [...open, [.323, carry, v(-.12,.028,.036)], ...finish];
  const partialBox = [...open, [catchOldLead, belt, v(-.069,.033,.013)], [oldLeadClear, belt],
    [boxFree, carry, v(-.029,.032,.014)], ...finish];
  const right = [[.85, r.rest], [catchBolt, charging, v(.075,.047,0)], [boltHome, charging],
    [1, r.rest, v(.06,.033,0)]];
  const ease = T.MathUtils.smoothstep;
  let active = false;
  return (p, empty, rounds) => {
    if (!active && p === 0) {
      beltMesh.count = Math.min(9, rounds);
      return 1;
    }
    active = p > 0;
    lid.rotation.x = -1.27 * (ease(p, catchLid, lidUp) - ease(p, palmOnLid, lidDown));
    bolt.position.z = .119 * (ease(p, catchBolt, .937) - ease(p, .939, boltHome));
    const drop = ease(p, boxFree, boxOut) - ease(p, boxIn, boxSeated);
    box.position.set(boxHome.x - .17 * drop, boxHome.y - .56 * drop, boxHome.z + .14 * drop);
    box.rotation.z = -.24 * drop;
    const fresh = p >= boxIn;
    box.visible = p < boxOut || fresh;
    const extension = fresh ? .13 + .87 * ease(p, catchNewLead, leadSeated) : 1 - ease(p, catchOldLead, oldLeadClear);
    // The starter belt rides with the new box. Its lead round becomes the left-hand socket.
    if (fresh && drop > 0) {
      beltMesh.quaternion.copy(box.quaternion);
      beltMesh.position.copy(boxHome).applyQuaternion(box.quaternion).negate().add(box.position);
    } else {
      beltMesh.quaternion.identity();
      beltMesh.position.set(0, 0, 0);
    }
    beltMesh.count = Math.min(Math.ceil(9 * extension), fresh ? 9 : rounds);
    feedPath.getPointAt(1 - extension, lead.position);
    l.update(p, empty ? emptyBox : partialBox);
    r.update(p, right);
    return extension;
  };
}
