export class JID {

    constructor(local: string, domain: string, resource: string);

    bare(): JID;

    equals(other: JID): boolean;

}

export function jid(jid: string): JID;
