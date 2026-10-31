export function apiFixture() {
    const fixtureOptions = window.__fixtureOptions || {};
    window.__requests = [];
    const me = { id: 'me', name: 'Тест', lastname: 'Владелец', department: 'frontend', following: [], followers: [] };
    const other = { id: 'person', name: 'Анна', lastname: 'Тестовая', following: [], followers: [] };
    const message = { id: 'message-1', chatId: 'chat-a', sequence: 1, authorId: 'person', content: 'Тестовое сообщение', createdAt: '2026-10-31T09:00:00Z' };
    const chat = { id: 'chat-a', type: 'group', name: 'Тестовая группа', participants: ['me','person'], members: [{userId:'me',lastReadSequence:0},{userId:'person',lastReadSequence:1}], myRole:'admin', lastSequence:1, lastReadSequence:0, unreadCount:1, avatar:'/api/chat/chats/chat-a/avatar/', avatarVersion:'upload-1', updatedAt:'2026-10-31T09:00:00Z', lastMessage:message };
    const comment = { id: 'comment-1', userId:'person', text:'Сохранённый комментарий', author:other, date:'2026-10-31T09:00:00Z' };
    const post = { id:'post-a', userId:'person', author:other, text:'Проверка кэша', date:'2026-10-31T09:00:00Z', commentsCount:26, likesCount:0, isLiked:false };
    const comments = Array.from({length:25}, (_, index) => ({...comment, id:'older-comment-' + index,
      text:'Ранний комментарий ' + index, date:new Date(Date.parse(comment.date) - (25-index)*60000).toISOString()})).concat(comment);
    const posts = [post, ...Array.from({length:24}, (_, index) => ({...post, id:'post-' + index, text:'Публикация ' + index, commentsCount:0}))];
    const people = [me, other, ...Array.from({length:24}, (_, index) => ({...other, id:'person-' + index, name:'Коллега ' + index}))];
    const chats = [chat, ...Array.from({length:24}, (_, index) => ({...chat, id:'chat-' + index, name:'Группа ' + index, avatar:'', avatarVersion:''})),
      {...chat,id:'general-chat',systemKey:'general',unreadCount:0,avatar:''},
      {...chat,id:'department-chat',systemKey:'department-frontend',departmentId:'frontend',unreadCount:0,avatar:''}];
    const messages = Array.from({length:fixtureOptions.messages || 1}, (_, index) => ({...message,
      id:'message-' + (index+1), sequence:index+1, content:index ? 'Сообщение ' + (index+1) : message.content}));
    chat.lastSequence = messages.length;
    chat.lastMessage = messages.at(-1);
    window.__pendingSends = [];
    window.__pendingComments = [];
    window.__commentMode = 'immediate';
    window.__sockets = [];
    window.__incoming = (content) => {
      const next = {...message, id:'message-' + (chat.lastSequence + 1), sequence:chat.lastSequence + 1,
        content, createdAt:new Date().toISOString()};
      messages.push(next);
      chat.lastSequence = next.sequence;
      chat.lastMessage = next;
      chat.updatedAt = next.createdAt;
      window.__sockets.at(-1).onmessage({data:JSON.stringify({type:'message.created', chat_id:chat.id, message:next})});
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (path, options = {}) => {
      if (!String(path).startsWith('/api/')) return nativeFetch(path, options);
      const url = new URL(path, location.origin);
      window.__requests.push({ path: url.pathname, search: url.search, method: options.method || 'GET' });
      if (fixtureOptions.delay) await new Promise(resolve => setTimeout(resolve, fixtureOptions.delay));
      const json = (data) => new Response(JSON.stringify(data), { headers: {'Content-Type':'application/json'} });
      const paginate = (rows, extra = {}) => {
        const offset = Number(url.searchParams.get('offset') || 0);
        const results = rows.slice(offset, offset + 20);
        const params = new URLSearchParams(url.search);
        params.set('offset', offset + 20);
        return json({...extra, results, next:offset + 20 < rows.length ? url.pathname + '?' + params : null});
      };
      if (url.pathname.endsWith('/csrf/')) return json({csrfToken:'test'});
      if (url.pathname.endsWith('/refresh/')) return json({access:'test'});
      if (url.pathname.endsWith('/me/')) return json(me);
      if (url.pathname.endsWith('/departments/')) return json([{id:'frontend',name:'Фронтенд'}]);
      if (url.pathname.endsWith('/users/batch/')) return json(url.searchParams.get('ids').split(',').map(id => people.find(person => person.id === id)));
      if (url.pathname.endsWith('/users/')) {
        const query = (url.searchParams.get('q') || '').toLowerCase();
        return paginate(people.filter(person => (person.name + ' ' + person.lastname).toLowerCase().includes(query)));
      }
      if (url.pathname.endsWith('/users/person/')) return json(other);
      if (url.pathname.endsWith('/users/me/')) return json(me);
      if (url.pathname.endsWith('/posts/post-a/comments/')) {
        if (options.method === 'POST') return new Promise(resolve => {
          const body = JSON.parse(options.body);
          const entry = { attemptId:body.attempt_id, text:body.text };
          window.__pendingComments.push(entry);
          entry.finish = (mode) => {
            if (mode === 'error') return resolve(new Response(JSON.stringify({detail:'Тестовая ошибка комментария'}), {status:503}));
            let created = body.attempt_id && comments.find(row => row.attempt_id === body.attempt_id && row.userId === 'me');
            if (!created) {
              created = {...comment, id:'comment-' + (comments.length + 1), userId:'me', author:me, text:body.text,
                attempt_id:body.attempt_id, date:new Date(Date.parse(comment.date) + comments.length*60000).toISOString()};
              comments.push(created);
              post.commentsCount++;
            }
            if (mode === 'accepted-error') return resolve(new Response(JSON.stringify({detail:'Ответ потерян'}), {status:503}));
            resolve(json({...created,commentsCount:post.commentsCount}));
          };
          if (window.__commentMode === 'immediate') entry.finish('success');
        });
        return paginate([...comments].reverse(), {commentsCount:post.commentsCount});
      }
      if (url.pathname.endsWith('/posts/post-a/like/')) return new Promise(resolve => {
        window.__finishLike = (success) => {
          if (!success) return resolve(new Response(JSON.stringify({detail:'Тестовая ошибка лайка'}), {status:503}));
          post.isLiked = options.method === 'PUT';
          post.likesCount = post.isLiked ? 1 : 0;
          resolve(json(post));
        };
      });
      if (url.pathname.endsWith('/posts/')) return paginate(posts);
      if (url.pathname.endsWith('/posts/post-a/')) return json(post);
      if (url.pathname.endsWith('/chats/')) return paginate(chats.filter(row =>
        row.name.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase())));
      if (url.pathname.endsWith('/unread/')) return json({chats:chats.map(row => ({id:row.id,unreadCount:row.unreadCount,
        lastReadSequence:row.lastReadSequence,lastSequence:row.lastSequence})),
        systemChats:chats.filter(row => row.systemKey).map(row => ({id:row.id,systemKey:row.systemKey,departmentId:row.departmentId})),
        totalUnread:chats.reduce((sum,row)=>sum+row.unreadCount,0)});
      if (url.pathname.endsWith('/chats/chat-a/')) return json(chat);
      if (url.pathname.endsWith('/messages/')) {
        if (options.method === 'POST') return new Promise(resolve => {
          const entry = { id:options.body.get('attempt_id'), text:options.body.get('text') };
          window.__pendingSends.push(entry);
          entry.finish = (mode) => {
            if (mode === 'error') return resolve(new Response(JSON.stringify({detail:'Тестовая ошибка отправки'}), {status:503}));
            const created = {...message, id:'message-' + (chat.lastSequence + 1), sequence:chat.lastSequence + 1,
              authorId:'me', content:entry.text, attempt_id:entry.id, createdAt:new Date().toISOString()};
            messages.push(created);
            chat.lastSequence = created.sequence;
            chat.lastMessage = created;
            chat.updatedAt = created.createdAt;
            if (mode === 'ws-fail') {
              window.__sockets.at(-1).onmessage({data:JSON.stringify({type:'message.created', chat_id:chat.id, message:created})});
              return resolve(new Response(JSON.stringify({detail:'Ответ потерян после подтверждения'}), {status:503}));
            }
            resolve(json(created));
          };
        });
        const after = Number(url.searchParams.get('after') || 0);
        return json({results:messages.filter(item => item.sequence > after), has_more:false});
      }
      if (url.pathname.endsWith('/read/')) {
        const sequence = JSON.parse(options.body).sequence;
        chat.lastReadSequence = sequence;
        chat.members[0].lastReadSequence = sequence;
        chat.unreadCount = 0;
        return json({ sequence, lastSequence:chat.lastSequence, unreadCount:0 });
      }
      if (url.pathname.endsWith('/avatar/')) return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>', { headers:{'Content-Type':'image/svg+xml'} });
      if (url.pathname.endsWith('/ws-ticket/')) return json({ticket:'test'});
      throw new Error('Unhandled mock request: ' + path);
    };
    const NativeSocket = window.WebSocket;
    window.WebSocket = class {
      static OPEN = 1; readyState = 1;
      constructor(url, protocols) {
        if (!String(url).includes('/ws/chat/')) return new NativeSocket(url, protocols);
        window.__sockets.push(this); setTimeout(() => this.onopen?.(), 0);
      }
      send(payload) { if (JSON.parse(payload).type === 'auth') queueMicrotask(() => this.onmessage?.({data:JSON.stringify({type:'auth.ready'})})); }
      close() {}
    };
    window.Notification = class { static permission = 'denied'; };
}
