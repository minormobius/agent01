/** Contact data model */

export interface Contact {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
  tags?: string[];
  /** ATProto DID if this contact is on the network */
  did?: string;
  handle?: string;
  createdAt: string;
}

export interface ContactRecord {
  rkey: string;
  contact: Contact;
  authorDid: string;
  orgRkey: string; // "personal" or org rkey
}
