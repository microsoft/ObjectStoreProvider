import { BTreeOrderedMap } from "./BTreeOrderedMap";
import { OrderedMapType } from "./OrderedMapType";
import { RBTreeOrderedMap } from "./RBTreeOrderedMap";

export { IOrderedMap } from "./IOrderedMap";
export { OrderedMapType };

export const createOrderedMap = <K, V>(mapType?: OrderedMapType) => {
  switch (mapType) {
    case "b+tree":
      return new BTreeOrderedMap<K, V>();
    case "red-black-tree":
    default:
      return new RBTreeOrderedMap();
  }
};
