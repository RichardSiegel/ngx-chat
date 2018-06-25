import { animate, state, style, transition, trigger } from '@angular/animations';
import { Component, EventEmitter, Inject, Input, OnInit, Output } from '@angular/core';
import { ChatService, ChatServiceToken, Contact, Translations } from '../../core';
import { ChatListStateService } from '../../services/chat-list-state.service';

@Component({
    selector: 'ngx-chat-roster-list',
    templateUrl: './roster-list.component.html',
    styleUrls: ['./roster-list.component.less'],
    animations: [
        trigger('rosterVisibility', [
            state('hidden', style({
                right: '-14em',
            })),
            state('shown', style({
                right: '0em',
            })),
            transition('hidden => shown', animate('400ms ease')),
            transition('shown => hidden', animate('400ms ease'))
        ]),
        trigger('drawerVisibility', [
            state('hidden', style({
                right: '0em',
            })),
            state('shown', style({
                right: '14em',
            })),
            transition('hidden => shown', animate('400ms ease')),
            transition('shown => hidden', animate('400ms ease'))
        ])
    ]
})
export class RosterListComponent implements OnInit {

    @Input()
    public translations: Translations;

    @Input()
    rosterState: string;

    @Output()
    rosterStateChanged: EventEmitter<string> = new EventEmitter<string>();

    constructor(@Inject(ChatServiceToken) public chatService: ChatService,
                private chatListService: ChatListStateService) {
    }

    ngOnInit() {
    }

    onClickContact(contact: Contact) {
        this.chatListService.openChat(contact.jidPlain);
    }

    toggleVisibility() {
        const newState = this.rosterState === 'shown' ? 'hidden' : 'shown';
        this.rosterStateChanged.emit(newState);
    }

}
