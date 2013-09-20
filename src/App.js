Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',

    scopeType: 'release',

    settingsScope: 'project',
    config: {
      defaultSettings: {
        costPerPoint: 200
      }
    },

    layout: 'fit',

    getSettingsFields: function () {
      return [{
        name: 'costPerPoint',
        label: 'Cost per Point',
        xtype: 'rallynumberfield'
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
      var query = scope.getQueryFilter();
      var release = scope.getRecord().raw;

      var featureConfig = {
        autoLoad: true,
        model: me.piTypes['0'],
        fetch: ['Name', 'Release', 'ObjectID', 'PreliminaryEstimate', 'Value', 'Rank'],
        filters: query
      };

      var storyConfig = {
        autoLoad: true,
        model: 'HierarchicalRequirement',
        fetch: ['Name', 'Release', me.featureField, 'ObjectID', 'PlanEstimate', 'InProgressDate', 'AcceptedDate'],
        filters: [{
          property: me.featureField + '.Release.Name',
          value: release.Name
        }, {
          property: me.featureField + '.Release.ReleaseStartDate',
          value: release.ReleaseStartDate
        }, {
          property: me.featureField + '.Release.ReleaseDate',
          value: release.ReleaseDate
        }, {
          property: 'DirectChildrenCount',
          value: '0'
        }]
      };

      me.createChart([featureConfig, storyConfig]);
    },

    createChart: function (storeConfig) {
      var me = this;

      me.removeAll(true);
      chart = Ext.create('Rally.ui.chart.Chart', {
        storeType: 'Rally.data.WsapiDataStore',
        storeConfig: storeConfig,

        calculatorType: 'FeatureProfileCalculator',
        calculatorConfig: {
          costPerPoint: me.getSetting('costPerPoint'),
          featureField: me.featureField
        },

        chartColors: ['green', 'yellow', 'grey', 'blue', 'red', 'orange'],

        chartConfig: {
          layout: 'fit',
          chart: {
            type: 'column',
            zoomType: 'y',
            height: me.getHeight()
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
            text: me.getContext().getTimeboxScope().getRecord().get('Name')
          },
          xAxis: {
            title: {
              text: 'Features'
            },
            labels: {
              //rotation: -45,
              //align: 'right'
            }
          },
          yAxis: [{ // Primary Axis
            min: 0,
            title: {
              text: 'Points'
            }
          }, { // Secondary Axis
            title: {
              text: 'Capital Cost'
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

      //chart.on('chartRendered', function (chart) {
        //chart.down('#chart').setHeight(me.getHeight() - 32);
      //});
    },
});
