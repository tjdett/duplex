// Generated by CoffeeScript 1.10.0
(function() {
  var UUIDv4, assert, duplex, errorMsg, replyMsg, requestMsg,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  assert = function(description, condition) {
    if (condition == null) {
      condition = false;
    }
    if (!condition) {
      throw Error("Assertion: " + description);
    }
  };

  duplex = {
    version: "0.1.0",
    protocol: {
      name: "SIMPLEX",
      version: "1.0"
    },
    request: "req",
    reply: "rep",
    handshake: {
      accept: "+OK"
    },
    JSON: ["json", JSON.stringify, JSON.parse],
    wrap: {
      "websocket": function(ws) {
        var conn;
        conn = {
          send: function(msg) {
            return ws.send(msg);
          },
          close: function() {
            return ws.close();
          }
        };
        ws.onmessage = function(event) {
          return conn.onrecv(event.data);
        };
        return conn;
      },
      "nodejs-websocket": function(ws) {
        var conn;
        conn = {
          send: function(msg) {
            return ws.send(msg);
          },
          close: function() {
            return ws.close();
          }
        };
        ws.on("text", function(msg) {
          return conn.onrecv(msg);
        });
        return conn;
      }
    }
  };

  requestMsg = function(payload, method, id, more, ext) {
    var msg;
    msg = {
      type: duplex.request,
      method: method,
      payload: payload
    };
    if (id != null) {
      msg.id = id;
    }
    if (more === true) {
      msg.more = more;
    }
    if (ext != null) {
      msg.ext = ext;
    }
    return msg;
  };

  replyMsg = function(id, payload, more, ext) {
    var msg;
    msg = {
      type: duplex.reply,
      id: id,
      payload: payload
    };
    if (more === true) {
      msg.more = more;
    }
    if (ext != null) {
      msg.ext = ext;
    }
    return msg;
  };

  errorMsg = function(id, code, message, data, ext) {
    var msg;
    msg = {
      type: duplex.reply,
      id: id,
      error: {
        code: code,
        message: message
      }
    };
    if (data != null) {
      msg.error.data = data;
    }
    if (ext != null) {
      msg.ext = ext;
    }
    return msg;
  };

  UUIDv4 = function() {
    var d, ref;
    d = new Date().getTime();
    if (typeof (typeof window !== "undefined" && window !== null ? (ref = window.performance) != null ? ref.now : void 0 : void 0) === "function") {
      d += performance.now();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r;
      r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      if (c !== 'x') {
        r = r & 0x3 | 0x8;
      }
      return r.toString(16);
    });
  };

  duplex.RPC = (function() {
    function RPC(codec) {
      this.codec = codec;
      this.encode = this.codec[1];
      this.decode = this.codec[2];
      this.registered = {};
    }

    RPC.prototype.register = function(method, handler) {
      return this.registered[method] = handler;
    };

    RPC.prototype.unregister = function(method) {
      return delete this.registered[method];
    };

    RPC.prototype.registerFunc = function(method, func) {
      return this.register(method, function(ch) {
        return ch.onrecv = function(args) {
          return func(args, (function(reply, more) {
            if (more == null) {
              more = false;
            }
            return ch.send(reply, more);
          }), ch);
        };
      });
    };

    RPC.prototype.callbackFunc = function(func) {
      var name;
      name = "_callback." + UUIDv4();
      this.registerFunc(name, func);
      return name;
    };

    RPC.prototype._handshake = function() {
      var p;
      p = duplex.protocol;
      return p.name + "/" + p.version + ";" + this.codec[0];
    };

    RPC.prototype.handshake = function(conn, onready) {
      var peer;
      peer = new duplex.Peer(this, conn, onready);
      conn.onrecv = function(data) {
        if (data[0] === "+") {
          conn.onrecv = peer.onrecv;
          return peer._ready(peer);
        } else {
          return assert("Bad handshake: " + data);
        }
      };
      conn.send(this._handshake());
      return peer;
    };

    RPC.prototype.accept = function(conn, onready) {
      var peer;
      peer = new duplex.Peer(this, conn, onready);
      conn.onrecv = function(data) {
        conn.onrecv = peer.onrecv;
        conn.send(duplex.handshake.accept);
        return peer._ready(peer);
      };
      return peer;
    };

    return RPC;

  })();

  duplex.Peer = (function() {
    function Peer(rpc, conn1, onready1) {
      this.rpc = rpc;
      this.conn = conn1;
      this.onready = onready1 != null ? onready1 : function() {};
      this.onrecv = bind(this.onrecv, this);
      assert("Peer expects an RPC", this.rpc.constructor.name === "RPC");
      assert("Peer expects a connection", this.conn != null);
      this.lastId = 0;
      this.ext = null;
      this.reqChan = {};
      this.repChan = {};
    }

    Peer.prototype._ready = function(peer) {
      return this.onready(peer);
    };

    Peer.prototype.close = function() {
      return this.conn.close();
    };

    Peer.prototype.call = function(method, args, onreply) {
      var ch;
      ch = new duplex.Channel(this, duplex.request, method, this.ext);
      if (onreply != null) {
        ch.id = ++this.lastId;
        ch.onrecv = onreply;
        this.repChan[ch.id] = ch;
      }
      return ch.send(args);
    };

    Peer.prototype.open = function(method, onreply) {
      var ch;
      ch = new duplex.Channel(this, duplex.request, method, this.ext);
      ch.id = ++this.lastId;
      this.repChan[ch.id] = ch;
      if (onreply != null) {
        ch.onrecv = onreply;
      }
      return ch;
    };

    Peer.prototype.onrecv = function(frame) {
      var ch, msg;
      if (frame === "") {
        return;
      }
      msg = this.rpc.decode(frame);
      switch (msg.type) {
        case duplex.request:
          if (this.reqChan[msg.id] != null) {
            ch = this.reqChan[msg.id];
            if (msg.more === false) {
              delete this.reqChan[msg.id];
            }
          } else {
            ch = new duplex.Channel(this, duplex.reply, msg.method);
            if (msg.id !== void 0) {
              ch.id = msg.id;
              if (msg.more === true) {
                this.reqChan[ch.id] = ch;
              }
            }
            assert("Method not registerd", this.rpc.registered[msg.method] != null);
            this.rpc.registered[msg.method](ch);
          }
          if (msg.ext != null) {
            ch.ext = msg.ext;
          }
          return ch.onrecv(msg.payload, msg.more);
        case duplex.reply:
          if (msg.error != null) {
            this.repChan[msg.id].onerr(msg.error);
            return delete this.repChan[msg.id];
          } else {
            this.repChan[msg.id].onrecv(msg.payload);
            if (msg.more === false) {
              return delete this.repChan[msg.id];
            }
          }
          break;
        default:
          return assert("Invalid message");
      }
    };

    return Peer;

  })();

  duplex.Channel = (function() {
    function Channel(peer1, type, method1, ext1) {
      this.peer = peer1;
      this.type = type;
      this.method = method1;
      this.ext = ext1;
      assert("Channel expects Peer", this.peer.constructor.name === "Peer");
      this.id = null;
      this.onrecv = function() {};
      this.onerr = function() {};
    }

    Channel.prototype.call = function(method, args, onreply) {
      var ch;
      ch = this.peer.open(method, onreply);
      ch.ext = this.ext;
      return ch.send(args);
    };

    Channel.prototype.close = function() {
      return this.peer.close();
    };

    Channel.prototype.open = function(method, onreply) {
      return this.peer.open(method, onreply);
    };

    Channel.prototype.send = function(payload, more) {
      if (more == null) {
        more = false;
      }
      switch (this.type) {
        case duplex.request:
          return this.peer.conn.send(this.peer.rpc.encode(requestMsg(payload, this.method, this.id, more, this.ext)));
        case duplex.reply:
          return this.peer.conn.send(this.peer.rpc.encode(replyMsg(this.id, payload, more, this.ext)));
        default:
          return assert("Bad channel type");
      }
    };

    Channel.prototype.senderr = function(code, message, data) {
      assert("Not reply channel", this.type !== duplex.reply);
      return this.peer.conn.send(this.peer.rpc.encode(errorMsg(this.id, code, message, data, this.context)));
    };

    return Channel;

  })();

  if (typeof window !== "undefined" && window !== null) {
    window.duplex = duplex;
  } else {
    exports.duplex = duplex;
  }

}).call(this);
