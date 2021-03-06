// An example AV.js Backbone application based on the todo app by

// the todo items and provide user authentication and sessions.

$(function() {

  AV.$ = jQuery;

  // Initialize AV with your AV application javascript keys
  AV.initialize("27uggoz476xw2e7luvpeem1e2ldlg6b4dxa1txhvfhxgjoow",
                   "18spio5ligsgc0ud8vue63d5p24lpraaghgpi9ngm2k59j3z");

  // Todo Model
  // ----------

  // Our basic Todo model has `content`, `order`, and `done` attributes.
  var Todo = AV.Object.extend("Todo", {
    // Default attributes for the todo.
    defaults: {
      content: "empty todo...",
      point: new AV.GeoPoint({latitude: 0, longitude: 0}),
      done: false
    },

    // Ensure that each todo created has `content`.
    initialize: function() {
      if (!this.get("content")) {
        this.set({"content": this.defaults.content});
        this.set({"point": this.defaults.point});
      }
    },

    // Toggle the `done` state of this todo item.
    toggle: function() {
      this.save({done: !this.get("done")});
    }
  });

  // This is the transient application state, not persisted on AV
  var AppState = AV.Object.extend("AppState", {
    defaults: {
      filter: "all"
    }
  });

  // Todo Collection
  // ---------------

  var TodoList = AV.Collection.extend({

    // Reference to this collection's model.
    model: Todo,

    // Filter down the list of all todo items that are finished.
    done: function() {
      return this.filter(function(todo){ return todo.get('done'); });
    },

    // Filter down the list to only todo items that are still not finished.
    remaining: function() {
      return this.without.apply(this, this.done());
    },

    // We keep the Todos in sequential order, despite being saved by unordered
    // GUID in the database. This generates the next order number for new items.
    nextOrder: function() {
      if (!this.length) return 1;
      return this.last().get('order') + 1;
    },

    // Todos are sorted by their original insertion order.
    comparator: function(todo) {
      return todo.get('order');
    }

  });

  // Todo Item View
  // --------------

  // The DOM element for a todo item...
  var TodoView = AV.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
//      "click .toggle"              : "toggleDone",
//      "dblclick label.todo-content" : "edit",
//      "click .todo-destroy"   : "clear",
      "keypress .edit"      : "updateOnEnter",
      	  "click .edit"      : "updateOnEnter",
//      "blur .edit"          : "close"
    },

    // The TodoView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a Todo and a TodoView in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render', 'close', 'remove');
      this.model.bind('change', this.render);
      this.model.bind('destroy', this.remove);
    },

    // Re-render the contents of the todo item.
    render: function() {
      var todo = this.model.toJSON();
      var userq = new AV.Query(AV.User);
      var that = this;
      userq.get(todo["user"]["objectId"],function(user){
          todo["user"] = user.toJSON();
          $(that.el).html(that.template(todo));
          that.input = that.$('.edit');
      });
      return this;
    },

    // Toggle the `"done"` state of the model.
    toggleDone: function() {
      this.model.toggle();
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the todo.
    close: function() {
      this.model.save({content: this.input.val()});
      $(this.el).removeClass("editing");
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    // Remove the item, destroy the model.
    clear: function() {
      this.model.destroy();
    }

  });

  // The Application
  // ---------------

  // The main view that lets a user manage their todo items
  var ManageTodosView = AV.View.extend({

    // Our template for the line of statistics at the bottom of the app.
    statsTemplate: _.template($('#stats-template').html()),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "keypress #new-todo":  "createOnEnter",
      "click #btn-send":  "createOnClick",
      "click #clear-completed": "clearCompleted",
      "click #toggle-all": "toggleAllComplete",
      "click .log-out": "logOut",
      "click ul#filters a": "selectFilter"
    },

    el: ".content",

    // At initialization we bind to the relevant events on the `Todos`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos that might be saved to AV.
    initialize: function() {
      var self = this;

      _.bindAll(this, 'addOne', 'addAll', 'addSome', 'render', 'toggleAllComplete', 'logOut', 'createOnEnter', 'createOnClick');

      // Main todo management template
      this.$el.html(_.template($("#manage-todos-template").html()));
      
      this.input = this.$("#new-todo");
      this.allCheckbox = this.$("#toggle-all")[0];

      // Create our collection of Todos
      this.todos = new TodoList;

      // Setup the query for the collection to look for todos from the current user
      this.todos.query = new AV.Query(Todo);
      this.todos.query.descending("createdAt");
//      this.todos.query.equalTo("point",
//        new AV.GeoPoint({latitude: this.$("#latitude").val(), longitude: this.$("#longitude").val()}));
        
      this.todos.bind('add',     this.addOne);
      this.todos.bind('reset',   this.addAll);
      this.todos.bind('all',     this.render);

      // Fetch all the todo items for this user
      this.todos.fetch();

      state.on("change", this.filter, this);
    },

    // Logs out the user and shows the login view
    logOut: function(e) {
      AV.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      var done = this.todos.done().length;
      var remaining = this.todos.remaining().length;

      this.$('#todo-stats').html(this.statsTemplate({
        total:      this.todos.length,
        done:       done,
        remaining:  remaining
      }));

      this.delegateEvents();

      this.allCheckbox.checked = !remaining;
    },

    // Filters the list based on which type of filter is selected
    selectFilter: function(e) {
      var el = $(e.target);
      var filterValue = el.attr("id");
      state.set({filter: filterValue});
      AV.history.navigate(filterValue);
    },

    filter: function() {
      var filterValue = state.get("filter");
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#" + filterValue).addClass("selected");
      if (filterValue === "all") {
        this.addAll();
      } else if (filterValue === "completed") {
        this.addSome(function(item) { return item.get('done') });
      } else {
        this.addSome(function(item) { return !item.get('done') });
      }
    },

    // Resets the filters to display all todos
    resetFilters: function() {
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#all").addClass("selected");
      this.addAll();
    },

    // Add a single todo item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(todo) {
      var view = new TodoView({model: todo});
      this.$("#todo-list").append(view.render().el);
    },

    // Add all items in the Todos collection at once.
    addAll: function(collection, filter) {
      this.$("#todo-list").html("");
      this.todos.each(this.addOne);
    },

    // Only adds some todos, based on a filtering function that is passed in
    addSome: function(filter) {
      var self = this;
      this.$("#todo-list").html("");
      this.todos.chain().filter(filter).each(function(item) { self.addOne(item) });
    },

    // If you hit return in the main input field, create new Todo model
    createOnEnter: function(e) {
      var self = this;
      if (e.keyCode != 13) return;
      if (navigator.geolocation) {
	  var opt = {timeout:10000};
	  navigator.geolocation.getCurrentPosition(function(position) {
	      var latitude = position.coords.latitude;
	      var longitude = position.coords.longitude;
	      self.todos.create({
		  content: self.input.val(),
		  order:   self.todos.nextOrder(),
		  done:    false,
		  user:    AV.User.current(),
		  point:   new AV.GeoPoint({"latitude": latitude, "longitude": longitude})
		  //ACL:     new AV.ACL(AV.User.current())
	      });

	      self.input.val('');
	      self.resetFilters();	      
	  }, function(err) {
	      alert("Error occurred! Error code: " + err.code);
	      // if(err.code == 1) {
	      // 	  alert("Error: Access is denied!");
	      // }else if( err.code == 2) {
	      // 	  alert("Error: Position is unavailable!");
	      // };	      
	}, opt);					   

      }
      else {
	  alert("Your web browser doesn't support Location service!");
      };

    },
    createOnClick: function() {
      var self = this;
      if (navigator.geolocation) {
	  var opt = {timeout:10000};
	  navigator.geolocation.getCurrentPosition(function(position) {
	      var latitude = position.coords.latitude;
	      var longitude = position.coords.longitude;
	      self.todos.create({
		  content: self.input.val(),
		  order:   self.todos.nextOrder(),
		  done:    false,
		  user:    AV.User.current(),
		  point:   new AV.GeoPoint({"latitude": latitude, "longitude": longitude})
		  //ACL:     new AV.ACL(AV.User.current())
	      });

	      self.input.val('');
	      self.resetFilters();	      
	  }, function(err) {
	      alert("Error occurred! Error code: " + err.code);
	      // if(err.code == 1) {
	      // 	  alert("Error: Access is denied!");
	      // }else if( err.code == 2) {
	      // 	  alert("Error: Position is unavailable!");
	      // };	      
	}, opt);					   

      }
      else {
	  alert("Your web browser doesn't support Location service!");
      };

    },
    // Clear all done todo items, destroying their models.
    clearCompleted: function() {
      _.each(this.todos.done(), function(todo){ todo.destroy(); });
      return false;
    },

    toggleAllComplete: function () {
      var done = this.allCheckbox.checked;
      this.todos.each(function (todo) { todo.save({'done': done}); });
    }
  });

  var LogInView = AV.View.extend({
    events: {
      "submit form.login-form": "logIn",
      "submit form.signup-form": "signUp"
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logIn", "signUp");
      this.render();
    },

    logIn: function(e) {
      var self = this;
      var username = this.$("#login-username").val();
      var password = this.$("#login-password").val();
      
      AV.User.logIn(username, password, {
        success: function(user) {
          new ManageTodosView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".login-form .error").html("Invalid username or password. Please try again.").show();
          this.$(".login-form button").removeAttr("disabled");
        }
      });

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
    },

    signUp: function(e) {
      var self = this;
      var username = this.$("#signup-username").val();
      var password = this.$("#signup-password").val();
      
      AV.User.signUp(username, password, {
        success: function(user) {
          new ManageTodosView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".signup-form .error").html(error.message).show();
          this.$(".signup-form button").removeAttr("disabled");
        }
      });

      this.$(".signup-form button").attr("disabled", "disabled");

      return false;
    },

    render: function() {
      this.$el.html(_.template($("#login-template").html()));
      this.delegateEvents();
    }
  });

  // The main view for the app
  var AppView = AV.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#todoapp"),

    initialize: function() {
      this.render();
    },

    render: function() {
      if (AV.User.current()) {
        new ManageTodosView();
      } else {
        new LogInView();
      }
    }
  });

  var AppRouter = AV.Router.extend({
    routes: {
      "all": "all",
      "active": "active",
      "completed": "completed"
    },

    initialize: function(options) {
    },

    all: function() {
      state.set({ filter: "all" });
    },

    active: function() {
      state.set({ filter: "active" });
    },

    completed: function() {
      state.set({ filter: "completed" });
    }
  });

  var state = new AppState;

  new AppRouter;
  new AppView;
  AV.history.start();
});
