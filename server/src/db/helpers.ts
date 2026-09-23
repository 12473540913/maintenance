import { ObjectId } from "mongodb";

export function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new Error(`Invalid id: ${id}`);
  return new ObjectId(id);
}

export function serialize<T extends Record<string, unknown>>(value: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = value as T & { _id: ObjectId };
  return { ...rest, id: _id.toString() } as Omit<T, "_id"> & { id: string };
}