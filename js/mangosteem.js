/*
|--------------------------------------------------------------------------
| Welcome to Mangosteem
|--------------------------------------------------------------------------
| Mangosteem is a web chat application powered by the Steem blockchain.
|
*/
var App = (function () {

	/**
	 * Available channel host accounts
	 * -------------------------------
	 * A channel host account is a Steem account containing only top-level blog posts.
	 * Host accounts should not make any comments on other posts due to the potential
	 * for corruption of the chat archive.
	 *
	 * For more information see https://mangosteem.com/hosts
	 *
	 */
	const HOSTS = [
		
	];

	var DEV_MODE = false;

	// Remember the initial width of the sidebars for state changes
	const leftSidebarInitialWidth = $('.App .LeftSidebar').width();
	const rightSidebarInitialWidth = $('.App .RightSidebar').width();
	
	var el = $('.App');

	/**
	 * Initializes all Mangosteem main modules
	 */
	var init = function () {
		App.log('App', 'Welcome to Mangosteem!!');
		Mangosteem.initSteemConnect();
		LeftSidebar.init(HOSTS);
		RightSidebar.init();
		Chat.init();
		DisplayHelper.showElement(el, true);
	};

	/**
	 * Sizes Chat elements based on the states of the
	 * LeftSidebar and RightSidebar
	 */
	var updateDrawerStates = function () {
		App.log('App');
		LeftSidebarToggle.updateButtonState();
		if (LeftSidebar.isOpen() && RightSidebar.isOpen()) {
			$('.App .Chat').css('margin-left', leftSidebarInitialWidth);
			$('.App .Chat').css('margin-right', rightSidebarInitialWidth);
			var lsb = leftSidebarInitialWidth + 'px';
			var rsb = rightSidebarInitialWidth + 'px';
			var width = 'calc(100vw - ' + lsb + ' - ' + rsb + ' - 85px)';
			$('.App .Chat .ChatInput .ChatInputTextArea').width(width);
		} else if (LeftSidebar.isOpen() && !RightSidebar.isOpen()) {
			$('.App .Chat').css('margin-left', leftSidebarInitialWidth);
			$('.App .Chat').css('margin-right', 0);
		} else if (!LeftSidebar.isOpen() && RightSidebar.isOpen()) {
			$('.App .Chat').css('margin-left', 0);
			$('.App .Chat').css('margin-right', rightSidebarInitialWidth);
			var width = 'calc(100vw - ' + rightSidebarInitialWidth + 'px - 85px)';
			$('.App .Chat .ChatInput .ChatInputTextArea').css('width', width);
		} else {
			$('.App .Chat').css('margin-left', 0);
			$('.App .Chat').css('margin-right', 0);
		}
	};

	/**
	 * Custom logging (dev only)
	 */
	var log = function (module, comment) {
		if (DEV_MODE) {
			if (arguments.callee.caller.arguments.length > 0) {
				console.log(module + '.' + arguments.callee.caller.name + ' (');
				console.log(arguments.callee.caller.arguments[0]);
				console.log(');');
			} else {
				console.log(module + '.' + arguments.callee.caller.name);
			}
			if (comment && typeof comment !== 'undefined') {
				console.log('[Comment] - ' + comment);
			}
		}
	};

    return {
        init : init,
        updateDrawerStates : updateDrawerStates,
        log : log
    };
   
})();

/**
 * Manages the state and presentation of the
 * chat subcomponents (ChannelInfo, Messages, Input)
 */
var Chat = (function () {

	/**
	 * Monitors the active channel
	 * ---------------------------
	 * It is possible that the user will click several channels
	 * from the channel list before any data is return from steemjs.
	 * Utilizing 'hostForActiveChannel' we discard any
	 * data returned for an inactive channel
	 *
	 */
	var hostForActiveChannel;	
	var activeChannelName;
	var activeChannelDescription;
	var activeChannelAvatar;

	var init = function () {
		App.log('Chat');
		ChatHeader.init();
		ChatInput.init();
	}

	var loadChannel = function (name, host, description, avatar) {
		App.log('Chat');
		ChatInput.showInputControlsForAuthorizedUsers();
		hostForActiveChannel = host;
		activeChannelName = name;
		activeChannelDescription = description;
		activeChannelAvatar = avatar;
		ChatHeader.update(name);
		ChatBox.loadChat(host);
		RightSidebar.update();
	}
	
	var isActiveChannel = function (operation) {
		if (operation.parent_author === hostForActiveChannel && operation.parent_link.substring(0, 20).toLowerCase() === "[mangosteem channel]" && operation.parent_link.substring(20,operation.parent_link.length) === activeChannelName){
			return true;
		}
		return false;
	}

	var getHostForActiveChannel = function () {
		return hostForActiveChannel;
	}

	var getActiveChannelName = function () {
		return activeChannelName;
	}

	var getActiveChannelDescription = function () {
		if (!getActiveChannelDescription || typeof(activeChannelDescription) === 'undefined') {
			return ' n/a ';
		}
		return activeChannelDescription;
	}

	var getActiveChannelAvatar = function () {
		if (!activeChannelAvatar || activeChannelAvatar === 'undefined') {
			return './img/avatar-default.png';
		}
		return activeChannelAvatar;
	}

    return {
        init : init,
		isActiveChannel : isActiveChannel,
		getHostForActiveChannel : getHostForActiveChannel,
        loadChannel : loadChannel,
        getActiveChannelName : getActiveChannelName,
        getActiveChannelDescription : getActiveChannelDescription,
        getActiveChannelAvatar : getActiveChannelAvatar
    };
   
})();
/**
 * Manages the state, presentation, and behavior of the ChatBox
 */
var ChatBox = (function () {

	var LOAD_MORE_LIMIT = 51;

	var el = $('.App .Chat .ChatBox');

	// Lazy loading is managed by applying a 'last' class to the last message loaded.
	// The scroll listener detects when this element is at the 'chatBoxTopOffset' position,
	// at which point it (1) displays a loading gif, (2) loads more messages, (3) removes the loading gif,
	// and (4) updates the element with the 'last' class.
 	var chatBoxTopOffset = $('.App .Chat .ChatHeader').height();
	var lastMessageSelector  = '.last';
	var lastMessageClassName =  'last';
	var loadingMoreSelector  = '.loading';
	var loadingMoreClassName = 'loading';

	var loadChat = function (host) {
		App.log('Chat');
		BlockObserver.stop();
		el.empty()
		loadLatest(host);
    };

    var loadLatest = function (host) {
    	App.log('ChatBox');
		var path = '@' + host + '/recent-replies';
		Mangosteem.getState(path).then(function(result) {
			var replies = []; // push to an array so we can sort the response
			$.each(result.content, function( index, value ) {
 				replies.push(value);
			});
			if (replies[0] && replies[0].parent_author !== Chat.getHostForActiveChannel() ) {
				App.log('Mangosteem.getState - discarding data returned for a non-active channel');
				return;
			}
			replies.sort(sortByCreatedDate);
			for (var i = 0; i < replies.length; i++) {
				var message = ChatBoxMessage.getMessageElement(replies[i]);
				if (replies.length === i + 1) {
					message.addClass(lastMessageClassName);
				}
				el.prepend(message);
			}
			scrollToBottom();
			App.log(' - Chat loaded up to block number ' + result.props.head_block_number);
			BlockObserver.beginPollingForNextBlockAfter(result.props.head_block_number);
		});
		el.scroll(scrollEvents);
    };

    var scrollEvents = function () {
		var selectorFound = $(lastMessageSelector).offset();
		// Load more at the top
		if (selectorFound && $(lastMessageSelector).offset().top === chatBoxTopOffset) {
			var author = $(lastMessageSelector).data('author');
			var permlink = $(lastMessageSelector).data('permlink');
			loadMore($(lastMessageSelector), author, permlink);
		}
		// Remove the new message button at the bottom
		if( el.scrollTop() + el.innerHeight() >= el[0].scrollHeight ) {
			var button = $('.new-messages-temp-button');
    		button.remove();
		}
    };

    var loadMore = function (lastMessageElement, author, permlink) {
    	App.log('ChatBox');
    	$(lastMessageSelector).removeClass(lastMessageClassName);
    	var loadingMore = $('<div class="' + loadingMoreClassName + '"></div>');
    	el.prepend(loadingMore); // display loading gif while waiting
    	Mangosteem.getRepliesByLastUpdate(author, permlink, LOAD_MORE_LIMIT).then(function(result) {
    		// keep the loading gif around but hidden
            // so we can scroll back to position after appending new messages
            $(loadingMoreSelector).css('height', 0); 
            for (var i = 0; i < result.length; i++) {
                if (i === 0) {
                    continue; // first message returned is already appended... skip
                }
                var message = ChatBoxMessage.getMessageElement(result[i]);
                if (result.length === i + 1) {
                    message.addClass(lastMessageClassName);
                }
                el.prepend(message);
            }
            if (result.length < LOAD_MORE_LIMIT) {
                $(lastMessageSelector).removeClass(lastMessageClassName);
                el.prepend($('<div class="beginning">Beginning of chat</div>'));
            }
            el.scrollTop($(loadingMoreSelector).offset().top - 140); // return to prior position
            $(loadingMoreSelector).remove();
    	});
    };

    var getNewMessage = function (author, permlink) {
    	App.log('ChatBox');
    	Mangosteem.getContent(author, permlink).then(function(result) {
    		var message = ChatBoxMessage.getMessageElement(result);
			// autoscroll to bottom if already at bottom
			// otherwise display a temporary new messages button
			if( el.scrollTop() + el.innerHeight() >= el[0].scrollHeight ) {
				el.append(message);
				scrollToBottom();
			} else {
				el.append(message);
				displayTemporaryNewMessagesButton();
			}
    	});
    };

    var displayTemporaryNewMessagesButton = function () {
        App.log('ChatBox');
    	var button = $('<div class="new-messages-temp-button"><i class="glyphicon glyphicon-chevron-down"></i> New messages</div>');
    	button.click( function () {	
			scrollToBottom();
			button.remove();
    	});
    	el.append(button);
    	button.css('display', 'none');
    	button.fadeIn(250).delay(5000).fadeOut(250, function() {
    		button.remove();
    	});
    };

    var scrollToBottom = function () {
    	el.scrollTop(el[0].scrollHeight);
    };

    var sortByCreatedDate = function (a, b) {
        if (a.created < b.created)
            return 1;
        if (a.created > b.created)
            return -1;
        return 0;
    };

	return {
        loadChat : loadChat,
        getNewMessage : getNewMessage
    };

})();

var ChatBoxMessage = (function () {

	// Use classes to monitor vote button state
	const votePending = 'pending';
	const voteComplete = 'complete';

	var getMessageElement = function (messageData) {
		var message = $(getMessageHtmlFrom(messageData));
		message = bindMessageDataTo(message, messageData);
		if (!User.getCurrentUser() || votingPeriodHasCompleted(messageData.created)) {
			message.find('.upvote-container').remove();
    		message.find('.downvote-container').remove();
		} else {
			message = updateButtonStatesOnLoad(message, messageData);
			message = bindUpvoteClickEventTo(message, messageData);
			message = bindDownvoteClickEventTo(message, messageData);
		}
		return message;
    };

    var bindUpvoteClickEventTo = function (message, messageData) {
		message.find('.upvote-container').click( function() {
			var voteButton = $(this);
			var siblingFlag = voteButton.next('.downvote-container');

			// If the a vote is pending for this message we should ignore all requests
			if (!voteButton.hasClass(votePending) && !siblingFlag.hasClass(votePending)) {
				voteButton.addClass(votePending);
				var voter = User.getCurrentUser();
				var author = message.data('author');
				var permlink = message.data('permlink');

				// Cast an upvote
				if (!voteButton.hasClass(voteComplete)) {
					if (User.getCurrentUserSP() < 500) {
						vote(voter, author, permlink, 10000, voteButton);
					} else {
						var title = "Upvote"
						ChatBoxVoteOverlay.display(true, title, voter, author, permlink, voteButton);
					}

				// Remove an upvote
				} else {
					vote(voter, author, permlink, 0, voteButton);
				}
			}
		
		});
		return message;
    };

    var bindDownvoteClickEventTo = function (message, messageData) {
		message.find('.downvote-container').click( function() {
			var voteButton = $(this);
			var siblingUpvote = voteButton.prev('.upvote-container');

			// If the a vote is pending for this message we should ignore all requests
			if (!voteButton.hasClass(votePending) && !siblingUpvote.hasClass(votePending)) {
				voteButton.addClass(votePending);
				var voter = User.getCurrentUser();
				var author = message.data('author');
				var permlink = message.data('permlink');

				// Flag a comment
				if (!voteButton.hasClass(voteComplete)) {
					if (User.getCurrentUserSP() < 500) {
						vote(voter, author, permlink, -10000, voteButton);
					} else {
						var title = "Flag";
						ChatBoxVoteOverlay.display(false, title, voter, author, permlink, voteButton);
					}

				// Remove a flag
				} else {
					vote(voter, author, permlink, 0, voteButton);
				}
			}

		});
		return message;
    };

    var vote = function (voter, author, permlink, weight, voteButton) {
    	Mangosteem.vote(voter, author, permlink, weight).then(function(result) {
	    	if (weight > 0) {
	    		voteButton.removeClass(votePending).addClass(voteComplete);
	    		voteButton.next('.downvote-container').removeClass(votePending).removeClass(voteComplete);
	    	} else if (weight < 0) {
	    		voteButton.removeClass(votePending).addClass(voteComplete);
	    		voteButton.prev('.upvote-container').removeClass(votePending).removeClass(voteComplete);
	    	} else {
	    		voteButton.removeClass(votePending).removeClass(voteComplete);
	    		if (voteButton.hasClass('upvote-container')) {
	    			voteButton.next('.downvote-container').removeClass(votePending).removeClass(voteComplete);
	    		} else {
	    			voteButton.prev('.upvote-container').removeClass(votePending).removeClass(voteComplete);
	    		}
	    	}
	    }).catch(function(error) {
			alert('Error casting vote');
			voteButton.removeClass(votePending);
		});
    };

    var updateButtonStatesOnLoad = function (message, messageData) {
		for (var i = 0; i < messageData.active_votes.length; i++) {
			if (messageData.active_votes[i].voter === User.getCurrentUser()) {
				if (messageData.active_votes[i].percent > 0) {
					message.find('.upvote-container').addClass(voteComplete);
					message.find('.downvote-container').removeClass(voteComplete);
				} else if (messageData.active_votes[i].percent < 0) {
					message.find('.downvote-container').addClass(voteComplete);
					message.find('.upvote-container').removeClass(voteComplete);
				} else {
					message.find('.upvote-container').removeClass(voteComplete);
					message.find('.downvote-container').removeClass(voteComplete);
				}
			}
		}
		return message;
    };

    var votingPeriodHasCompleted = function (createdDate) {
    	var upvotePermittedUntil = moment(createdDate).add(9360, 'm'); // 7 days * 24 hr * 60 min
    	return upvotePermittedUntil.isBefore(moment());
    };

    var bindMessageDataTo = function (message, messageData) {
    	message.data('author', messageData.author);
		message.data('permlink', messageData.permlink);
		return message;
    };

    var getMessageHtmlFrom = function(messageData) {

    	var clean = DOMPurify.sanitize(messageData.body);
    	var cleaner = strip(clean);

    	var formattedCreatedDate = getFormattedTimestamp(messageData.created);
    	var html = `
    		<div class="ChatBoxMessage">
				<div class="message-container">
					<div class="avatar-container">
						<img class="avatar" src="https://img.steemconnect.com/@${messageData.author}" />
					</div>
					<div class="content-container">
						<div class="message-info">
							<a class="author" target="_blank" href="http://steemit.com/@${messageData.author}">
								@${messageData.author}
							</a>
							<span class="message-created">
								${formattedCreatedDate}
							</span>
							<span class="message-option upvote-container">
								<i class="glyphicon glyphicon-menu-up"></i>
							</span>
							<span class="message-option downvote-container">
								<i class="glyphicon glyphicon-flag"></i>
							</span>
						</div>
						<div class="message-body">
							${cleaner}
						</div>
					</div>
					<div class="clear"></div>
				</div>
			</div>
		`;
		return html;
    };

    var strip = function (html)
	{
	   var tmp = document.createElement("DIV");
	   tmp.innerHTML = html;
	   return tmp.textContent || tmp.innerText || "";
	}

    var getFormattedTimestamp = function(raw) {
    	var date = moment.utc(raw);
		var local = moment(date).local();
		var localTime = moment(date).local().format('h:mm a');
		var localDay = moment(date).local().format(', D MMM');
		var localYear = moment(date).local().format(' YYYY');
		var formatted = localTime;
		if (!moment().isSame(local, 'day')) {
			formatted = formatted + '<span class="dd-mm">' + localDay + '</span>';
		}
		if (!moment().isSame(local, 'year')) {
			formatted = formatted + '<span class="yyyy">' + localYear + '</span>';
		}
    	return formatted;
    };

	return {
        getMessageElement : getMessageElement,
        vote : vote
    };

})();

/**
 * Manages the state and presentation of the chat header region
 */
var ChatHeader = (function () {

	var elChannelName = $('.App .Chat .ChatHeader .channel-name');

	var init = function () {
		App.log('ChatHeader');
		elChannelName.text('Mangosteem');
	};

	var update = function (name) {
		App.log('ChatHeader');
    	elChannelName.text(name);
    };

    return {
        init : init,
        update : update
    };
   
})();
/**
 * Manages the state and presentation of the chat input region
 */
var ChatInput = (function () {

    var postingBlocked = false;  // Prevents the user from entering messages
    var postBlockedCounter = 21; // for 20 seconds

    var el = $('.App .Chat .ChatInput');

	var init = function () {
		App.log('ChatInput');
        Mangosteem.getAuthorizedUser().then(function(result) {
            ChatInputTextArea.init(el);
            ChatInputSubmitButton.init(el);
        }).catch(function(error) {
            ChatInputAuthButton.init(el, 'Login', steemconnect.getLoginURL());
            ChatInputAuthButton.init(el, 'Sign Up', 'https://steemit.com/pick_account');
        });
	}

    var postMessage = function () {
        App.log('ChatInput');
        if (!postingBlocked && !ChatInputTextArea.isEmpty()) {
            
            // Message data
            var parentAuthor = Chat.getHostForActiveChannel();
            var parentPermlink = Chat.getActiveChannelName();
            var author = User.getCurrentUser();
            var permlink = steem.formatter.commentPermlink(parentAuthor, parentPermlink);
            var title = '';
            var body = ChatInputTextArea.getText();
            var jsonMetadata = JSON.stringify({
                app: 'mangosteem',
                format: 'markdown+html',
                tags: 'mangosteem-message'
            });

            blockPostingTemporarily();
            ChatInputSubmitButton.disable();
            ChatInputTextArea.clear();
            steemconnect.comment(parentAuthor, parentPermlink, author, permlink, title, body, jsonMetadata, function(err, result) {
                App.log('steemconnect.comment [response result]', result);
            });
        }
    };

    var blockPostingTemporarily = function () {
        App.log('ChatInput');
        if (postBlockedCounter !== 0) {
            postingBlocked = true;
            ChatInputSubmitButton.setText(postBlockedCounter)
            postBlockedCounter = postBlockedCounter - 1;
            setTimeout(blockPostingTemporarily, 1100);
        } else {
            postingBlocked = false;
            ChatInputSubmitButton.enable();
            postBlockedCounter = 21;
        }
    }

    var showInputControlsForAuthorizedUsers = function () {
        App.log('ChatInput');
        if (User.getCurrentUser() !== null) {
            ChatInputTextArea.display();
            ChatInputSubmitButton.display();
        }
    };

    return {
        init : init,
        postMessage : postMessage,
        showInputControlsForAuthorizedUsers : showInputControlsForAuthorizedUsers
    };
   
})();

/**
 * User login and sign up buttons
 */
var ChatInputAuthButton = (function () {

    var init = function (parent, text, url) {
        App.log('ChatInputAuthButton');
        var link = $('<a class="login-signup-button" href="' + url + '">' + text + '</a>');
        parent.append(link);
        link.css('display', 'none').fadeIn();
    };

    return {
        init : init
    };
   
})();

/**
 * Chat input submit button
 */
var ChatInputSubmitButton = (function () {

    var el = $('<button class="ChatInputSubmitButton"></button>');

    var init = function (parent) {
    	App.log('ChatInputSubmitButton');
        el.click(function() {
            ChatInput.postMessage();
        });
        enable();
        el.css('display', 'none');
    	parent.append(el);
    };

    // Sets the button presentation to a disabled state.
    // The click event is still bound to the button,
    // but responses are blocked within ChatInput.
    var disable = function () {
        el.empty();
        el.append('<span></span>');
        el.addClass('disabled');
    };

    var enable = function () {
        el.empty();
        el.append('<i class="glyphicon glyphicon-send"></i>');
        el.removeClass('disabled');
    };

    var setText = function (text) {
        el.children('span').text(text);
    }

    var display = function () {
        el.fadeIn();
    }

    return {
        init : init,
        disable : disable,
        enable : enable,
        setText : setText,
        display : display
    };
   
})();

/**
 * Chat input text area
 */
var ChatInputTextArea = (function () {

    var el = $('<textarea class="ChatInputTextArea"></textarea>');

    var init = function (parent) {
    	App.log('ChatInputTextArea');

    	el.keypress(function (e) {
            if (e.which == 13) {
                ChatInput.postMessage();
                return false;
            }
        });

        el.css('display', 'none');
    	parent.append(el);
    };

    var isEmpty = function () {
        return el.val() === '';
    };

    var clear = function () {
        el.val('');
    };

    var getText = function () {
        return el.val();
    };

    var display = function () {
        el.fadeIn();
    }

    return {
        init : init,
        isEmpty : isEmpty,
        clear : clear,
        getText : getText,
        display : display
    };
   
})();


var ChannelInfoOverlay = (function () {

	var el, slider, range, value, closeBtn, upvoteBtn;

	var display = function (channelName) {
		App.log('ChannelInfoOverlay');

		var channelName = Chat.getActiveChannelName();
		var host = Chat.getHostForActiveChannel();
		var avatar = Chat.getActiveChannelAvatar();
		var description = Chat.getActiveChannelDescription();

    	el = $(getOverlayHtml(channelName, host, avatar, description));
    	slider = el.find('.vote-slider');
	    range = el.find('.vote-slider-range');
	    value = el.find('.vote-slider-value');
	    closeBtn = el.find('.close-overlay-button');
	    upvoteBtn = el.find('.upvote-submit-button');

	    closeBtn.click( function() {
        	el.remove();
        });

    	$('body').append(el);
	};

	var getOverlayHtml = function(channelName, host, avatar, description) {
		var html = `
    		<div class="overlay">
		        <div class="overlay-inner">
		            <div class="ChannelInfoOverlay">
		                <h2 class="title">Channel Info</h2>
		                <span class="close-overlay-button"><i class="glyphicon glyphicon-remove"></i></span>
		                <hr />
		                <div class="avatar">
		                    <img src="${avatar}" />
		                </div>
		                <h3>${channelName}</h3>
		                <p><span>Host Account:</span> ${host}</p>
		                <p><span>Description:</span> ${description}</p>
		            </div>
		        </div>
		    </div>
		`;
		return html;
	};

	var initVoteSlider = function() {
		slider.each( function () {
			value.each(function(){
				var value = $(this).prev().attr('value');
			});
			range.on('input', function(){
				$(this).next(value).html(this.value);
			});
		});
	};

    return {
        display : display
    };
   
})();

var ChatBoxVoteOverlay = (function () {

	var el, slider, range, value, closeBtn, upvoteBtn;

	var display = function (isUpvote, title, voter, author, permlink, voteButton) {

    	el = $(getOverlayHtml(title));
    	slider = el.find('.vote-slider');
	    range = el.find('.vote-slider-range');
	    value = el.find('.vote-slider-value');
	    closeBtn = el.find('.close-overlay-button');
	    upvoteBtn = el.find('.upvote-submit-button');

	    initVoteSlider();

	    closeBtn.click( function() {
        	voteButton.removeClass('pending');
        	el.remove();
        });

	    var weight;
        if (isUpvote) {
        	upvoteBtn.click(function() {
        		var weight = range.val() * 100;
        		ChatBoxMessage.vote(voter, author, permlink, weight, voteButton);
        		el.remove();
        	});
		} else {
			upvoteBtn.click(function() {
				var weight = range.val() * -100;
				ChatBoxMessage.vote(voter, author, permlink, weight, voteButton);
        		el.remove();
        	});
		};

    	$('body').append(el);
	};

	var getOverlayHtml = function(title) {
		var html = `
    		<div class="overlay">
		        <div class="overlay-inner">
		        	<div class="ChatBoxVoteOverlay">
			            <h2 class="title">${title}</h2>
			            <span class="close-overlay-button"><i class="glyphicon glyphicon-remove"></i></span>
			            <hr />
			            <div class="vote-slider">
			                <input class="vote-slider-range" type="range" value="1" min="1" max="100">
			                <span class="vote-slider-value">1</span><span class="percent">%</span>
			                <button class="upvote-submit-button">Confirm</button>
			            </div>
			        </div>
		        </div>
		    </div>
		`;
		return html;
	};

	var initVoteSlider = function() {
		slider.each( function () {
			value.each(function(){
				var value = $(this).prev().attr('value');
			});
			range.on('input', function(){
				$(this).next(value).html(this.value);
			});
		});
	};

    return {
        display : display
    };
   
})();

var DisplayHelper = (function () {

	var showElement = function (el, show) {
		if (show) {
			el.css({opacity: 0, visibility: "visible"}).animate({opacity: 1.0}, 300);
		} else {
			el.css('visibility', 'hidden');
		}
	}

    return {
        showElement : showElement
    };
   
})();
var ChannelList = ( function () {

    var el = $('.App .LeftSidebar .ChannelList');

    var init = function (channels) {
        App.log('ChannelList');
        /*Mangosteem.getValidHostAccounts(hosts).then(function(result) {
            var validHostAccounts = result;
            validHostAccounts.sort(ascendingByChannelName);
            buildChannelListGroup('Channels', validHostAccounts);
        }).catch(function(error) {
            alert(error);
        });*/
		buildChannelListGroup('Channels', channels);
    };

    // Builds and renders channel list group elements
    var buildChannelListGroup = function (channelGroupName, channels) {
        App.log('ChannelList');
        var group = $('<div class="channel-list-group"></div>');
        var title = $('<h3 class="channel-list-group-name">' + channelGroupName + '</h3>');
        var ul = $('<ul class="channel-list"></ul>');
        for (var i = 0; i < channels.length; i++) {
			/*
			 * TODO: implement several channels
			 */
			var li = $('<li></li>');
            li.text('# ' + channels[i][1]);
            li.data('host', channels[i][0]);
            li.data('description', "");
            li.data('avatar', "")
            li.click(function () {
                // block user from requesting same channel repeatedly when it is slow to load
                if (!($(this).hasClass('active'))) {
                    el.find('.active').removeClass('active');
                    $(this).addClass('active');
                    var name = $(this).text();
                    var host = $(this).data('host');
					var desc = $(this).data('description');
                    var avatar = $(this).data('avatar');
                    Chat.loadChannel(name, host, desc, avatar);
                }
                LeftSidebar.autoCloseOnSmallerDevices();
            });
            DisplayHelper.showElement(li, false);
            ul.append(li);
            DisplayHelper.showElement(li, true);
        }
        group.append(title);
        group.append(ul);
        el.append(group);
    };

    // Sorts channels alphabetically by channel name
    var ascendingByChannelName = function (a, b) {
        if (a.name.toLowerCase() < b.name.toLowerCase())
            return -1;
        if (a.name.toLowerCase() > b.name.toLowerCase())
            return 1;
        return 0;
    }

    return {
        init : init
    };
   
})();

/**
 * Manages the LeftSidebar state and presentation
 */
var LeftSidebar = (function () {

	const SMALL_DEVICE_BREAKPOINT = 780;

	var el = $('.App .LeftSidebar');

	var init = function (channels) {
		App.log('LeftSidebar');
		autoCloseOnSmallerDevices();
		User.init();
		ChannelList.init(channels);
		LeftSidebarToggle.init();
		el.css('visibility', 'visible');
	};

	var isOpen = function () {
		return el.is(':visible');
	};

	var open = function () {
		App.log('LeftSidebar');
		el.css('display', 'block');
		App.updateDrawerStates();
	};

	var close = function () {
		App.log('LeftSidebar');
		el.css('display', 'none');
		App.updateDrawerStates();
	};

	var autoCloseOnSmallerDevices = function () {
		App.log('LeftSidebar');
        if ($(window).width() <= SMALL_DEVICE_BREAKPOINT) {
            close();
        }
	};

    return {
        init : init,
        isOpen : isOpen,
        open : open,
        close : close,
        autoCloseOnSmallerDevices : autoCloseOnSmallerDevices
    };
   
})();

var LeftSidebarToggle = (function () {

	var el = $('.App .Chat .ChatHeader .LeftSiderbarToggle');
	var closeGlyphiconClass = 'glyphicon-menu-left';
	var menuGlyphiconClass = 'glyphicon-menu-hamburger';

	var init = function () {
		App.log('LeftSidebarToggle');
		el.append('<i class="glyphicon"></i>');
		el.click( function () {
			if (LeftSidebar.isOpen()) {
				LeftSidebar.close()
			} else {
				LeftSidebar.open();
			}
		});
	};

	// Updates the toggle buttons glyphicon based on the state of the LeftSidebar
	var updateButtonState = function () {
		App.log('LeftSidebarToggle');
		if (LeftSidebar.isOpen()) {
			el.children().removeClass(menuGlyphiconClass).addClass(closeGlyphiconClass);
		} else {
			el.children().removeClass(closeGlyphiconClass).addClass(menuGlyphiconClass);
		}
	};

    return {
        init : init,
        updateButtonState : updateButtonState
    };
   
})();

/**
 * Manages the RightSidebar state and presentation
 */
var RightSidebar = (function () {

	var el = $('.App .RightSidebar');

	var elChannelInfo = $('.App .RightSidebar .channel-info-button');

	var init = function () {
		App.log('RightSidebar');
		initButtons();
		close();
	};

	var isOpen = function () {
		return el.is(':visible');
	};

	var open = function () {
		App.log('RightSidebar');
		el.css('display', 'block');
		App.updateDrawerStates();
	};

	var close = function () {
		App.log('RightSidebar');
		el.css('display', 'none');
		App.updateDrawerStates();
	};

	var update = function() {
		App.log('RightSidebar');
		open();
	};

	var initButtons = function () {
		initChannelInfoButton();
	};

	var initChannelInfoButton = function () {
		App.log('RightSidebar');
		elChannelInfo.click(function () {
			ChannelInfoOverlay.display();
		});
	};

    return {
        init : init,
        isOpen : isOpen,
        update : update
    };
   
})();

var User = (function () {

	var user = {
		isAuthenticated : false,
		name : null,
		sp : null
	}

	var el = $('.LeftSidebar .User');
	var elAvatar = $('.LeftSidebar .User .avatar');
	var elUsername = $('.LeftSidebar .User .name');
	var elButton = $('.LeftSidebar .User .login-logout-button');
	var elLoginGlyphicon = $('<i class="glyphicon glyphicon-log-in"></i>');
	var elLogoutGlyphicon = $('<i class="glyphicon glyphicon-log-out"></i>');

	var init = function () {
		App.log('User');
		DisplayHelper.showElement(el, false);
		Mangosteem.getAuthorizedUser().then(function(result) {
			user = result;
			return Mangosteem.getUserSP(user.name);
		}).then(function(result) {
			user.sp = result;
			renderElementsForAuthorizedUser();
		}).catch(function(error) {
			renderElementsForUnauthorizedUser();
		});
	};

	var getCurrentUser = function () {
		App.log('User');
        return user.name;
    };

	var getCurrentUserSP = function () {
		App.log('User');
		return user.sp;
	};

	var renderElementsForAuthorizedUser = function () {
		App.log('User');
		elAvatar.append('<img src="https://img.steemconnect.com/@' + user.name + '" />');
		elUsername.text(user.name);
		elButton.append(elLogoutGlyphicon);
		elButton.click(function() {
        	window.location.replace('https://steemconnect.com/logout');
        });
        DisplayHelper.showElement(el, true);
	};

	var renderElementsForUnauthorizedUser = function () {
		App.log('User');
		elAvatar.append('<img src="./img/avatar-lurker.png" />');
		elUsername.text('Lurker');
		var loginURL = steemconnect.getLoginURL();
        console.log(loginURL);
        elButton.append(elLoginGlyphicon);
        elButton.click(function() {
        	window.location.replace(loginURL);
        });
        DisplayHelper.showElement(el, true);
	};

    return {
        init : init,
        getCurrentUser : getCurrentUser,
        getCurrentUserSP : getCurrentUserSP
    };
   
})();

/**
 * Monitors the head block for chat activity.
 */
var BlockObserver = (function () {

	/**
	 * The current block number we are polling for
	 */
	var blockNum;

	/**
	 * Used to identify if getBlock is returning a block that
	 * has already been processed
	 */
	var previousBlockId;

	/**
	 * Our getBlock timer
	 */
	 var timer = 0;

	/**
	 * Timer duration
	 */
	var TIMEOUT_DURATION = 2500;

	var beginPollingForNextBlockAfter = function (headBlockNum) {
		App.log('Mangosteem');
		blockNum = headBlockNum + 1; // we are all loaded up to headBlockNum
		getBlock();
	};

	var getBlock = function () {
		App.log('Mangosteem');

		// The BlockObserver can potentially fall behind the current block.
		// For example when leaving the browser unattended until my computer sleeps,
		// the app has been hundreds of blocks behind upon awakening.
		// The current solution is to refresh the browser if behind.
		steem.api.getDynamicGlobalProperties(function(err, result) {
			console.log("Behind by " + (result.head_block_number - blockNum) + " blocks");
			if (blockNum < result.head_block_number - 10) {
				// *** poor solution until custom channel urls are implemented ***
				// Another option is to increase the rate at which blocks are fetched until
				// the app is able to catch up with the head block
				location.reload();
			}
		});

		steem.api.getBlock(blockNum, function(err, result) {		
			if (!err && result !== null && previousBlockId !== result.previous) {
				console.log(' - processing block number ' + blockNum);

				// Check for new comments on the current chat channel
				// (i.e. any comment made on a channel host account post or comment)
				var txs = result.transactions;
				for (var i = 0; i < txs.length; i++) {
					var operationType = txs[i].operations[0][0]; // json array soup
					if (operationType === 'comment') {
						var comment = txs[i].operations[0][1];
						if (Chat.isActiveChannel(comment)){
							App.log(' - found new channel message');
							ChatBox.getNewMessage(comment.author, comment.permlink);
						}
					}
				}

				// look for next block
				blockNum++;
				previousBlockId = result.previous;
			}
		});

		timer = setTimeout(getBlock, TIMEOUT_DURATION);
	};

	var stop = function () {
		if (timer) {
			App.log('BlockObserver.stop')
            clearTimeout(timer);
            timer = 0;
        }
	};

    return {
        stop : stop,
        beginPollingForNextBlockAfter : beginPollingForNextBlockAfter
    };
   
})();

/**
 * Wrapper for Steem related functions
 */
var Mangosteem = (function () {

    //Steem Connect app credentials
    const SC_APP_NAME = 'jga';
    const SC_CALLBACK_URL = document.location;//document.location.protocol + '//' + document.location.host + document.location.pathname;

    var initSteemConnect = function () {
        App.log('Mangosteem');
        steemconnect.init({
            app: SC_APP_NAME,
            callbackURL: SC_CALLBACK_URL
        });
    };

    var getAuthorizedUser = function () {
        App.log('Mangosteem');
        return new Promise(function(resolve, reject) {
            steemconnect.isAuthenticated (function(err, result) {
                if (!err) {
                    resolve({
                        isAuthenticated : result.isAuthenticated,
                        name : result.username
                    });
                }
                reject({
                    isAuthenticated : false
                });
            });
        });
    };

    var getUserSP = function (username) {
        App.log('Mangosteem');
        return Promise.all([
            steem.api.getAccounts([username]),
            steem.api.getDynamicGlobalProperties()
        ]).then( function([user, globals]) {
            const totalSteem = Number(globals.total_vesting_fund_steem.split(' ')[0]);
            const totalVests = Number(globals.total_vesting_shares.split(' ')[0]);
            const userVests = Number(user[0].vesting_shares.split(' ')[0]);
            return totalSteem * (userVests / totalVests);
        });
    };

    var getValidHostAccounts = function (accounts) {
        App.log('Mangosteem');
        return new Promise(function(resolve, reject) {
            steem.api.getAccounts(accounts, function(err, result) {
                if (!err) {
                    var validHostAccounts = [];
                    for (var i = 0; i < result.length; i++) {
                        // Discard host accounts with invalid json metadata
                        if (result[i].json_metadata === '') {
                            continue;
                        }
                        var json = JSON.parse(result[i].json_metadata);
                        if (typeof json.profile.name == 'undefined')
                            continue;
                        // Push valid host accounts to array
                        validHostAccounts.push({
                            host : result[i].name,
                            name : json.profile.name,
                            description : json.profile.about,
                            avatar : json.profile.profile_image
                        });
                    }
                    resolve(validHostAccounts);
                } else {
                    reject('SteemJS had trouble loading the channel host accounts.');
                }
            });
        });
    };

    var getState = function (recentRepliesPath) {
        App.log('Mangosteem');
        return new Promise(function(resolve, reject) {
            steem.api.getState(recentRepliesPath, function(err, result) {
                if (!err) {
                    resolve(result);
                } else {
                    reject('SteemJS had trouble loading the chat messages');
                }
            });
        });
    };

    var getRepliesByLastUpdate = function (author, permlink, LOAD_MORE_LIMIT) {
        App.log('Mangosteem');
        return new Promise(function(resolve, reject) {
            steem.api.getRepliesByLastUpdate(author, permlink, LOAD_MORE_LIMIT, function(err, result) {
                if (!err) {
                    console.log(author + ' ' + permlink + ' ' + LOAD_MORE_LIMIT);
                    resolve(result);
  nm               } else {
                    reject('SteemJS had trouble loading more chat messages');
                }
            });
        });
    };

    var getContent = function (author, permlink) {
        App.log('Mangosteem');
        return new Promise(function(resolve, reject) {
            steem.api.getContent(author, permlink, function(err, result) {
                if (!err) {
                    resolve(result);
                } else {
                    reject('SteemJS had trouble loading a new chat message');
                }
            });
        });
    };

    var vote = function (voter, author, permlink, weight) {
        App.log('Mangosteem');
        return new Promise(function(resolve, reject) {
            steemconnect.vote(voter, author, permlink, weight, function(err, result) {
                if (!err) {
                    resolve(result);
                } else {
                    console.log(err);
                    reject('Steemconnect had trouble voting on this message.');
                }
            });
        });
    };

    return {
        initSteemConnect : initSteemConnect,
        getAuthorizedUser : getAuthorizedUser,
        getUserSP : getUserSP,
        getValidHostAccounts : getValidHostAccounts,
        getState : getState,
        getRepliesByLastUpdate : getRepliesByLastUpdate,
        getContent : getContent,
        vote : vote
    }
    
})();

function searchChannel(){
	var input = document.getElementById("input-channel").value.split('/');	
	if(input.length < 2){
		console.log("Syntax error: the query must be author/channel");
		return;
	}
	var channels = [[input[0],input[1]]];
	
	LeftSidebar.init(channels);
	RightSidebar.init();
	Chat.init();
	DisplayHelper.showElement(el, true);
}

document.getElementById('input-account').onkeydown = function(e){   
   if(e.keyCode == 13){	 
	 e.preventDefault();
     searchChannel();
   }
};