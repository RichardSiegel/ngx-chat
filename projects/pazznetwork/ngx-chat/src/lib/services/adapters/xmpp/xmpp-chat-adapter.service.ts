import { Injectable } from '@angular/core';
import { jid as parseJid } from '@xmpp/jid';
import { BehaviorSubject, merge, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ChatActionContext } from '../../../components/chat-window/chat-window.component';

import { ChatPlugin, Contact, LogInRequest, Stanza, Translations } from '../../../core';
import { dummyAvatar } from '../../../core/contact-avatar';
import { ChatService } from '../../chat-service';
import { ContactFactoryService } from '../../contact-factory.service';
import { LogService } from '../../log.service';
import { MessageArchivePlugin, MessagePlugin, RosterPlugin } from './plugins';
import { XmppChatConnectionService } from './xmpp-chat-connection.service';

@Injectable()
export class XmppChatAdapter implements ChatService {

    message$ = new Subject<Contact>();
    messageSent$: Subject<Contact> = new Subject();

    contacts$ = new BehaviorSubject<Contact[]>([]);
    contactsSubscribed$: Observable<Contact[]> = this.contacts$.pipe(
        map(contacts => contacts.filter(contact => contact.isSubscribed())));
    contactRequestsReceived$: Observable<Contact[]> = this.contacts$.pipe(
        map(contacts => contacts.filter(contact => contact.pendingIn$.getValue())));
    contactRequestsSent$: Observable<Contact[]> = this.contacts$.pipe(
        map(contacts => contacts.filter(contact => contact.pendingOut$.getValue())));
    contactsUnaffiliated$: Observable<Contact[]> = this.contacts$.pipe(
        map(contacts => contacts.filter(contact => contact.isUnaffiliated() && contact.messages.length > 0)));
    state$ = new BehaviorSubject<'disconnected' | 'connecting' | 'online'>('disconnected');
    plugins: ChatPlugin[] = [];
    enableDebugging = false;
    userAvatar$ = new BehaviorSubject(dummyAvatar);
    translations: Translations;
    chatActions = [{
        id: 'sendMessage',
        cssClass: 'chat-window-send',
        html: '&raquo;',
        onClick: (chatActionContext: ChatActionContext) => {
            chatActionContext.chatWindow.sendMessage();
        },
    }];
    private lastLogInRequest: LogInRequest;

    constructor(public chatConnectionService: XmppChatConnectionService,
                private logService: LogService,
                private contactFactory: ContactFactoryService) {
        this.state$.subscribe((state) => this.logService.info('state changed to:', state));
        chatConnectionService.state$
            .pipe(filter(nextState => nextState !== this.state$.getValue()))
            .subscribe((nextState) => {
                if (nextState === 'online') {
                    this.state$.next('connecting');
                    Promise.all(this.plugins.map(plugin => plugin.onBeforeOnline()))
                        .then(
                            () => this.announceAvailability(),
                            (e) => {
                                this.logService.error('error while connecting', e);
                                this.announceAvailability();
                            }
                        );
                } else {
                    if (nextState === 'disconnected') {
                        this.contacts$.next([]);
                        this.plugins.forEach(plugin => {
                            try {
                                plugin.onOffline();
                            } catch (e) {
                                this.logService.error('error while handling offline in ', plugin);
                            }
                        });
                    }
                    this.state$.next(nextState);
                }
            });
        this.chatConnectionService.stanzaUnknown$.subscribe((stanza) => this.onUnknownStanza(stanza));

        merge(this.messageSent$, this.message$).subscribe(() => {
            // re-emit contacts when sending or receiving a message to refresh contcat groups
            // if the sending contact was in 'other', he still is in other now, but passes the 'messages.length > 0' predicate, so that
            // he should be seen now.
            this.contacts$.next(this.contacts$.getValue());
        });
    }

    private announceAvailability() {
        this.chatConnectionService.sendPresence();
        this.state$.next('online');
    }

    public addPlugins(plugins: ChatPlugin[]) {
        plugins.forEach(plugin => {
            this.plugins.push(plugin);
        });
    }

    reloadContacts(): void {
        this.getPlugin(RosterPlugin).refreshRosterContacts();
    }

    getContactById(jidPlain: string) {
        const bareJidToFind = parseJid(jidPlain).bare();
        return this.contacts$.getValue().find(contact => contact.jidBare.equals(bareJidToFind));
    }

    getOrCreateContactById(jidPlain: string, name?: string) {
        let contact = this.getContactById(jidPlain);
        if (!contact) {
            contact = this.contactFactory.createContact(parseJid(jidPlain).bare().toString(), name);
            this.contacts$.next([contact, ...this.contacts$.getValue()]);
        }
        return contact;
    }

    addContact(identifier: string) {
        this.getPlugin(RosterPlugin).addRosterContact(identifier);
    }

    removeContact(identifier: string) {
        this.getPlugin(RosterPlugin).removeRosterContact(identifier);
    }

    logIn(logInRequest: LogInRequest): void {
        this.lastLogInRequest = logInRequest;
        if (this.state$.getValue() === 'disconnected') {
            this.chatConnectionService.logIn(logInRequest);
        }
    }

    logOut(): void {
        if (this.state$.getValue() !== 'disconnected') {
            this.chatConnectionService.logOut();
        }
    }

    sendMessage(jid: string, body: string) {
        this.getPlugin(MessagePlugin).sendMessage(jid, body);
        this.messageSent$.next(this.getOrCreateContactById(jid));
    }

    loadCompleteHistory() {
        return this.getPlugin(MessageArchivePlugin).loadAllMessages();
    }

    getPlugin<T extends ChatPlugin>(constructor: new(...args: any[]) => T): T {
        for (const plugin of this.plugins) {
            if (plugin.constructor === constructor) {
                return plugin as T;
            }
        }
        throw new Error('plugin not found: ' + constructor);
    }

    private onUnknownStanza(stanza: Stanza) {

        let handled = false;

        for (const plugin of this.plugins) {
            try {
                if (plugin.handleStanza(stanza)) {
                    this.logService.debug(plugin.constructor.name, 'handled', stanza.toString());
                    handled = true;
                }
            } catch (e) {
                this.logService.error('error handling stanza in ', plugin.constructor.name, e);
            }
        }

        if (!handled) {
            this.logService.warn('unknown stanza <=', stanza.toString());
        }

    }

    reconnectSilently(): void {
        this.chatConnectionService.reconnectSilently();
    }

    reconnect() {
        this.logIn(this.lastLogInRequest);
    }

}
