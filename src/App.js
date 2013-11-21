Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',

    scopeType: 'release',

    settingsScope: 'project',
    config: {
      defaultSettings: {
        includeBefore: 0,
        includeAfter: 0,
        costPerPoint: 200,
        truncateStringLength: 20,
        rotateLabels: false
      }
    },

    layout: 'fit',

    getSettingsFields: function () {
      return [{
        name: 'costPerPoint',
        label: 'Cost per Point',
        xtype: 'rallynumberfield'
      }, {
        name: 'includeBefore',
        label: 'Include Previous Releases',
        xtype: 'rallynumberfield'
      }, {
        name: 'includeAfter',
        label: 'Include Subsequent Releases',
        xtype: 'rallynumberfield'
      },{
        name: 'truncateStringLength',
        label: 'Truncate Feature Names Length',
        xtype: 'rallynumberfield'
      }, {
        name: 'rotateLabels',
        label: 'Rotate Labels',
        xtype: 'rallycheckboxfield'
      }];
    },

    addContent: function (scope) {
      var me = this;

      Ext.create('Rally.data.WsapiDataStore', {
        autoLoad: true,
        remoteFilter: false,
        model: 'TypeDefinition',
        sorters: [{
          property: 'Ordinal',
          direction: 'Desc'
        }],
        filters: [{
          property: 'Parent.Name',
          operator: '=',
          value: 'Portfolio Item'
        }, {
          property: 'Creatable',
          operator: '=',
          value: 'true'
        }],
        listeners: {
          load: function (store, recs) {
            me.piTypes = {};

            Ext.Array.each(recs, function (type) {
              me.piTypes[type.get('Ordinal') + ''] = type.get('TypePath');
            });

            me.featureField = me.piTypes['0'].split('/')[1];

            me.onScopeChange(scope);
          },
          scope: me
        }
      });
    },

    onScopeChange: function (scope) {
      var me = this;

      me._queryForReleases(scope, function (releases) {
        var startDate = releases[0].raw.ReleaseStartDate;
        var endDate = releases[releases.length - 1].raw.ReleaseDate;
        me.releaseList = releases;

        var featureConfig = {
          autoLoad: true,
          model: me.piTypes['0'],
          fetch: ['Name', 'Release', 'ObjectID', 'FormattedID', 'PreliminaryEstimate', 'Value', 'Rank'],
          filters: [{
            property: 'Release.ReleaseStartDate',
            operator: '>=',
            value: startDate
          }, {
            property: 'Release.ReleaseDate',
            operator: '<=',
            value: endDate
          }]
        };

        var storyConfig = {
          autoLoad: true,
          model: 'HierarchicalRequirement',
          fetch: ['Name', 'Release', me.featureField, 'ObjectID', 'PlanEstimate', 'InProgressDate', 'AcceptedDate'],
          filters: [{
            property: me.featureField + '.Release.ReleaseStartDate',
            operator: '>=',
            value: startDate
          }, {
            property: me.featureField + '.Release.ReleaseDate',
            operator: '<=',
            value: endDate
          }, {
            property: 'DirectChildrenCount',
            value: '0'
          }]
        };

        me.createChart([featureConfig, storyConfig]);
      });
    },

    _queryForReleases: function (scope, callback) {
      var me = this;
      var query;
      var requestedReleases = [];
      var processedReleases = [];
      var numReleaseReqs = 0;
      var preRels = parseInt('' + me.getSetting('includeBefore'), 10) || 0;
      var supRels = parseInt('' + me.getSetting('includeAfter'), 10) || 0;

      var doProcess = function (records, operator, success) {
        //console.log('doProcess:arguments', arguments);
        var rels = [];

        if (records) {
          processedReleases.push(records);
        }

        if (processedReleases.length === numReleaseReqs) {
          rels = rels.concat.apply(rels, processedReleases);
          rels.push(scope.getRecord());

          rels.sort(function (a, b) {
            var da = Rally.util.DateTime.fromIsoString(a.raw.ReleaseStartDate);
            var db = Rally.util.DateTime.fromIsoString(b.raw.ReleaseStartDate);
            return Rally.util.DateTime.getDifference(da, db, 'day');
          });

          callback(rels);
        }
      };

      if (preRels) {
        numReleaseReqs++;
        requestedReleases.push(Ext.create('Rally.data.WsapiDataStore', {
          model: 'Release',
          //autoLoad: true,
          pageSize: preRels,
          remoteFilter: true,
          remoteSort: true,
          context: {
            projectScopeUp: false,
            projectScopeDown: false
          },
          sorters: [{ 
            property: 'ReleaseStartDate',
            direction: 'DESC'
          }],
          filters: [{
            property: 'ReleaseStartDate',
            operator: '<',
            value: me._getStartDate(scope.getRecord())
          }]
        }));
      }

      if (supRels) {
        numReleaseReqs++;
        requestedReleases.push(Ext.create('Rally.data.WsapiDataStore', {
          model: 'Release',
          //autoLoad: true,
          pageSize: supRels,
          remoteFilter: true,
          remoteSort: true,
          context: {
            projectScopeUp: false,
            projectScopeDown: false
          },
          sorters: [{ 
            property: 'ReleaseStartDate',
            direction: 'ASC'
          }],
          filters: [{
            property: 'ReleaseDate',
            operator: '>',
            value: me._getEndDate(scope.getRecord())
          }]
        }));
      }

      Ext.Array.each(requestedReleases, function (rr) {
        rr.loadPage(1, { scope: me, callback: doProcess });
      });

      if (!(preRels || supRels)) {
        doProcess();
      }
    },

    createChart: function (storeConfig) {
      var me = this;
      var subtitle = Ext.Array.map(me.releaseList, function (release) {
        return release.raw.Name;
      }).join(', ');

      var labelConfig = {
        formatter: function () {
          var parts = this.value.split('::');
          var oid = parts[0];
          var fid = parts[1];
          var name = parts[2];
          var len = parseInt('' + me.getSetting('truncateStringLength'), 10);

          if (!isNaN(len) && len > 0) {
            name = Ext.util.Format.ellipsis(name, len, true);
          }

          return fid + ': ' + name;
        }
      };

      if (!!me.getSetting('rotateLabels')) {
        labelConfig.rotation = -45;
        labelConfig.align = 'right';
      }

      me.removeAll(true);
      chart = Ext.create('Rally.ui.chart.Chart', {
        storeType: 'Rally.data.WsapiDataStore',
        storeConfig: storeConfig,

        calculatorType: 'FeatureProfileCalculator',
        calculatorConfig: {
          costPerPoint: me.getSetting('costPerPoint'),
          featureField: me.featureField
        },

        chartColors: ['#2ecc71', '#f1c40f', '#95a5a6', '#3498db', '#e74c3c', '#e67e22'],

        chartConfig: {
          layout: 'fit',
          chart: {
            type: 'column',
            zoomType: 'x',
            height: me.getHeight(),
            width: me.getWidth()
          },
          plotOptions: {
            column: {
              stacking: 'normal'
            }
          },
          title: {
            text: 'Feature Profile'
          },
          subtitle: {
            text: subtitle
          },
          tooltip: {
            formatter: function () {
              var parts = this.key.split("::");
              var value = this.y;

              if (this.series.name.indexOf('Cost') !== -1) {
                value =  Ext.util.Format.currency(value) + ' (' + (parseInt('' +  value, 10) / parseInt(me.getSetting('costPerPoint'), 10)) + ' SP)';
              }

              return '<span style="font-size: 10px">' + parts[1] + ': ' + parts[2] + '</span><br/>' +
                     '<span style="color:' + this.series.color + '">' + this.series.name + '</span>: <b>' + value + '</b><br/>';
            }
          },
          xAxis: {
            title: {
              text: 'Features'
            },
            labels: labelConfig
          },
          yAxis: [{ // Primary Axis
            min: 0,
            title: {
              text: 'Points'
            }
          }, { // Secondary Axis
            title: {
              text: 'Estimated Cost'
            },
            min: 0,
            opposite: true,
            labels: {
              formatter: function () {
                return Ext.util.Format.currency(this.value);
              }
            }
          }]
        }
      });

      var container = {
        xtype: 'container',
        itemId: 'container',
      };

      me.add(container);
      me.down('#container').add(chart);
    },

    _getStartDate: function (release) {
      return release.raw.ReleaseStartDate;
    },

    _getEndDate: function (release) {
      return release.raw.ReleaseDate;
    }
});
