if (!CMS.Views['Settings']) CMS.Views.Settings = {}; // ensure the pseudo pkg exists

CMS.Views.Settings.Grading = CMS.Views.ValidatingView.extend({
    // Model class is CMS.Models.Settings.CourseGradingPolicy
    events : {
        "change input" : "updateModel",
        "change textarea" : "updateModel",
        "change span[contenteditable=true]" : "updateDesignation",
        "click .settings-extra header" : "showSettingsExtras",
        "click .new-grade-button" : "addNewGrade",
        "click .remove-button" : "removeGrade",
        "click .add-grading-data" : "addAssignmentType",
        // would love to move to a general superclass, but event hashes don't inherit in backbone :-(
        'focus :input' : "inputFocus",
        'blur :input' : "inputUnfocus"
    },
    initialize : function() {
        //  load template for grading view
        var self = this;
        this.gradeCutoffTemplate = _.template('<li class="grade-specific-bar" style="width:<%= width %>%"><span class="letter-grade" contenteditable>' +
                '<%= descriptor %>' +
                '</span><span class="range"></span>' +
                '<% if (removable) {%><a href="#" class="remove-button">remove</a><% ;} %>' +
        '</li>');

        // Instrument grading scale
        // convert cutoffs to inversely ordered list
        var modelCutoffs = this.model.get('grade_cutoffs');
        for (var cutoff in modelCutoffs) {
            this.descendingCutoffs.push({designation: cutoff, cutoff: Math.round(modelCutoffs[cutoff] * 100)});
        }
        this.descendingCutoffs = _.sortBy(this.descendingCutoffs,
                function (gradeEle) { return -gradeEle['cutoff']; });

        // Instrument grace period
        this.$el.find('#course-grading-graceperiod').timepicker();

        // instantiates an editor template for each update in the collection
        // Because this calls render, put it after everything which render may depend upon to prevent race condition.
        window.templateLoader.loadRemoteTemplate("course_grade_policy",
                "/static/client_templates/course_grade_policy.html",
                function (raw_template) {
            self.template = _.template(raw_template);
            self.render();
        }
        );
        this.model.on('error', this.handleValidationError, this);
        this.model.get('graders').on('remove', this.render, this);
        this.model.get('graders').on('reset', this.render, this);
        this.model.get('graders').on('add', this.render, this);
        this.selectorToField = _.invert(this.fieldToSelectorMap);
    },

    render: function() {
        // prevent bootstrap race condition by event dispatch
        if (!this.template) return;

        // Create and render the grading type subs
        var self = this;
        var gradelist = this.$el.find('.course-grading-assignment-list');
        // Undo the double invocation error. At some point, fix the double invocation
        $(gradelist).empty();
        var gradeCollection = this.model.get('graders');
        gradeCollection.each(function(gradeModel) {
            $(gradelist).append(self.template({model : gradeModel }));
            var newEle = gradelist.children().last();
            var newView = new CMS.Views.Settings.GraderView({el: newEle, 
                model : gradeModel, collection : gradeCollection });
        });

        // render the grade cutoffs
        this.renderCutoffBar();

        var graceEle = this.$el.find('#course-grading-graceperiod');
        graceEle.timepicker({'timeFormat' : 'H:i'}); // init doesn't take setTime
        if (this.model.has('grace_period')) graceEle.timepicker('setTime', this.model.gracePeriodToDate());
        // remove any existing listeners to keep them from piling on b/c render gets called frequently
        graceEle.off('change', this.setGracePeriod);
        graceEle.on('change', this, this.setGracePeriod);

        return this;
    },
    addAssignmentType : function(e) {
        e.preventDefault();
        this.model.get('graders').push({});
    },
    fieldToSelectorMap : {
        'grace_period' : 'course-grading-graceperiod'
    },
    setGracePeriod : function(event) {
        event.data.clearValidationErrors();
        var newVal = event.data.model.dateToGracePeriod($(event.currentTarget).timepicker('getTime'));
        if (event.data.model.get('grace_period') != newVal) event.data.model.save('grace_period', newVal,
                { error : CMS.ServerError});
    },
    updateModel : function(event) {
        if (!this.selectorToField[event.currentTarget.id]) return;

        switch (this.selectorToField[event.currentTarget.id]) {
        case 'grace_period': // handled above
            break;

        default:
            this.saveIfChanged(event);
        break;
        }
    },

    // Grade sliders attributes and methods
    // Grade bars are li's ordered A -> F with A taking whole width, B overlaying it with its paint, ...
    // The actual cutoff for each grade is the width % of the next lower grade; so, the hack here
    // is to lay down a whole width bar claiming it's A and then lay down bars for each actual grade
    // starting w/ A but posting the label in the preceding li and setting the label of the last to "Fail" or "F"

    // A does not have a drag bar (cannot change its upper limit)
    // Need to insert new bars in right place.
    GRADES : ['A', 'B', 'C', 'D'],	// defaults for new grade designators
    descendingCutoffs : [],  // array of { designation : , cutoff : }
    gradeBarWidth : null, // cache of value since it won't change (more certain)

    renderCutoffBar: function() {
        var gradeBar =this.$el.find('.grade-bar'); 
        this.gradeBarWidth = gradeBar.width();
        var gradelist = gradeBar.children('.grades');
        // HACK fixing a duplicate call issue by undoing previous call effect. Need to figure out why called 2x
        gradelist.empty();
        var nextWidth = 100; // first width is 100%
        // Can probably be simplified to one variable now.
        var removable = false;
        var draggable = false; // first and last are not removable, first is not draggable
        _.each(this.descendingCutoffs, 
                function(cutoff, index) {
            var newBar = this.gradeCutoffTemplate({ 
                descriptor : cutoff['designation'] , 
                width : nextWidth, 
                removable : removable });
            gradelist.append(newBar);
            if (draggable) {
                newBar = gradelist.children().last(); // get the dom object not the unparsed string
                newBar.resizable({
                    handles: "e",
                    containment : "parent",
                    start : this.startMoveClosure(),
                    resize : this.moveBarClosure(),
                    stop : this.stopDragClosure()
                });
            }
            // prepare for next
            nextWidth = cutoff['cutoff'];
            removable = true; // first is not removable, all others are
            draggable = true;
        },
        this);
        // add fail which is not in data
        var failBar = this.gradeCutoffTemplate({ descriptor : this.failLabel(), 
            width : nextWidth, removable : false});
        $(failBar).find("span[contenteditable=true]").attr("contenteditable", false);
        gradelist.append(failBar);
        gradelist.children().last().resizable({
            handles: "e",
            containment : "parent",
            start : this.startMoveClosure(),
            resize : this.moveBarClosure(),
            stop : this.stopDragClosure()
        });

        this.renderGradeRanges();
    },

    showSettingsExtras : function(event) {
        $(event.currentTarget).toggleClass('active');
        $(event.currentTarget).siblings.toggleClass('is-shown');
    },


    startMoveClosure : function() {
        // set min/max widths
        var cachethis = this;
        var widthPerPoint = cachethis.gradeBarWidth / 100;
        return function(event, ui) {
            var barIndex = ui.element.index();
            // min and max represent limits not labels (note, can's make smaller than 3 points wide)
            var min = (barIndex < cachethis.descendingCutoffs.length ? cachethis.descendingCutoffs[barIndex]['cutoff'] + 3 : 3);
            // minus 2 b/c minus 1 is the element we're effecting. It's max is just shy of the next one above it
            var max = (barIndex >= 2 ? cachethis.descendingCutoffs[barIndex - 2]['cutoff'] - 3 : 97);
            ui.element.resizable("option",{minWidth : min * widthPerPoint, maxWidth : max * widthPerPoint});
        };
    },

    moveBarClosure : function() {
        // 0th ele doesn't have a bar; so, will never invoke this
        var cachethis = this;
        return function(event, ui) {
            var barIndex = ui.element.index();
            // min and max represent limits not labels (note, can's make smaller than 3 points wide)
            var min = (barIndex < cachethis.descendingCutoffs.length ? cachethis.descendingCutoffs[barIndex]['cutoff'] + 3 : 3);
            // minus 2 b/c minus 1 is the element we're effecting. It's max is just shy of the next one above it
            var max = (barIndex >= 2 ? cachethis.descendingCutoffs[barIndex - 2]['cutoff'] - 3 : 100);
            var percentage = Math.min(Math.max(ui.size.width / cachethis.gradeBarWidth * 100, min), max);
            cachethis.descendingCutoffs[barIndex - 1]['cutoff'] = Math.round(percentage);
            cachethis.renderGradeRanges();
        };
    },

    renderGradeRanges: function() {
        // the labels showing the range e.g., 71-80
        var cutoffs = this.descendingCutoffs;
        this.$el.find('.range').each(function(i) {
            var min = (i < cutoffs.length ? cutoffs[i]['cutoff'] : 0);
            var max = (i > 0 ? cutoffs[i - 1]['cutoff'] : 100);
            $(this).text(min + '-' + max);
        });
    },

    stopDragClosure: function() {
        var cachethis = this;
        return function(event, ui) {
            // for some reason the resize is setting height to 0
            cachethis.saveCutoffs();
        };
    },

    saveCutoffs: function() {
        this.model.save('grade_cutoffs', 
                _.reduce(this.descendingCutoffs, 
                        function(object, cutoff) { 
                    object[cutoff['designation']] = cutoff['cutoff'] / 100.0;
                    return object;
                }, 
                {}),
                { error : CMS.ServerError});
    },

    addNewGrade: function(e) {
        e.preventDefault();
        var gradeLength = this.descendingCutoffs.length; // cutoffs doesn't include fail/f so this is only the passing grades
        if(gradeLength > 3) {
            // TODO shouldn't we disable the button
            return;
        }
        var failBarWidth = this.descendingCutoffs[gradeLength - 1]['cutoff'];
        // going to split the grade above the insertion point in half leaving fail in same place
        var nextGradeTop = (gradeLength > 1 ? this.descendingCutoffs[gradeLength - 2]['cutoff'] : 100);
        var targetWidth = failBarWidth + ((nextGradeTop - failBarWidth) / 2);
        this.descendingCutoffs.push({designation: this.GRADES[gradeLength], cutoff: failBarWidth});
        this.descendingCutoffs[gradeLength - 1]['cutoff'] = Math.round(targetWidth);

        var $newGradeBar = this.gradeCutoffTemplate({ descriptor : this.GRADES[gradeLength], 
            width : targetWidth, removable : true });
        var gradeDom = this.$el.find('.grades');
        gradeDom.children().last().before($newGradeBar);
        var newEle = gradeDom.children()[gradeLength];
        $(newEle).resizable({
            handles: "e",
            containment : "parent",
            start : this.startMoveClosure(),
            resize : this.moveBarClosure(),
            stop : this.stopDragClosure()
        });

        // Munge existing grade labels?
        // If going from Pass/Fail to 3 levels, change to Pass to A
        if (gradeLength === 1 && this.descendingCutoffs[0]['designation'] === 'Pass') {
            this.descendingCutoffs[0]['designation'] = this.GRADES[0];
            this.setTopGradeLabel();
        }
        this.setFailLabel();

        this.renderGradeRanges();
        this.saveCutoffs();
    },

    removeGrade: function(e) {
        e.preventDefault();
        var domElement = $(e.currentTarget).closest('li');
        var index = domElement.index();
        // copy the boundary up to the next higher grade then remove
        this.descendingCutoffs[index - 1]['cutoff'] = this.descendingCutoffs[index]['cutoff'];
        this.descendingCutoffs.splice(index, 1);
        domElement.remove();

        if (this.descendingCutoffs.length === 1 && this.descendingCutoffs[0]['designation'] === this.GRADES[0]) {
            this.descendingCutoffs[0]['designation'] = 'Pass';
            this.setTopGradeLabel();
        }
        this.setFailLabel();
        this.renderGradeRanges();
        this.saveCutoffs();
    },

    updateDesignation: function(e) {
        var index = $(e.currentTarget).closest('li').index();
        this.descendingCutoffs[index]['designation'] = $(e.currentTarget).html();
        this.saveCutoffs();
    },

    failLabel: function() {
        if (this.descendingCutoffs.length === 1) return 'Fail';
        else return 'F';
    },
    setFailLabel: function() {
        this.$el.find('.grades .letter-grade').last().html(this.failLabel());
    },
    setTopGradeLabel: function() {
        this.$el.find('.grades .letter-grade').first().html(this.descendingCutoffs[0]['designation']);
    }

});

CMS.Views.Settings.GraderView = CMS.Views.ValidatingView.extend({
    // Model class is CMS.Models.Settings.CourseGrader
    events : {
        "change input" : "updateModel",
        "change textarea" : "updateModel",
        "click .remove-grading-data" : "deleteModel",
        // would love to move to a general superclass, but event hashes don't inherit in backbone :-(
        'focus :input' : "inputFocus",
        'blur :input' : "inputUnfocus"
    },
    initialize : function() {
        this.model.on('error', this.handleValidationError, this);
        this.selectorToField = _.invert(this.fieldToSelectorMap);
        this.render();
    },

    render: function() {
        return this;
    },
    fieldToSelectorMap : {
        'type' : 'course-grading-assignment-name',
        'short_label' : 'course-grading-assignment-shortname',
        'min_count' : 'course-grading-assignment-totalassignments',
        'drop_count' : 'course-grading-assignment-droppable',
        'weight' : 'course-grading-assignment-gradeweight'
    },
    updateModel : function(event) {
        // HACK to fix model sometimes losing its pointer to the collection [I think I fixed this but leaving
        // this in out of paranoia. If this error ever happens, the user will get a warning that they cannot
        // give 2 assignments the same name.]
        if (!this.model.collection) {
            this.model.collection = this.collection;
        }

        switch (event.currentTarget.id) {
        case 'course-grading-assignment-totalassignments':
            this.$el.find('#course-grading-assignment-droppable').attr('max', $(event.currentTarget).val());
            this.saveIfChanged(event);
            break;
        case 'course-grading-assignment-name':
            var oldName = this.model.get('type');
            if (this.saveIfChanged(event) && !_.isEmpty(oldName)) {
                // overload the error display logic
                this._cacheValidationErrors.push(event.currentTarget);
                $(event.currentTarget).parent().append(
                        this.errorTemplate({message : 'For grading to work, you must change all "' + oldName +
                            '" subsections to "' + this.model.get('type') + '".'}));
            }
            break;
        default:
            this.saveIfChanged(event);
        break;
        }
    },
    deleteModel : function(e) {
        this.model.destroy(
                { error : CMS.ServerError});
        e.preventDefault();
    }

});