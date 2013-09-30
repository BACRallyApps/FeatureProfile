var __sumArray = function (arr, filterFn) {
  var sum = 0;
  var holder;

  if (!filterFn) {
    filterFn = function () { return true; };
  }

  Ext.Array.each(arr, function (itm) {
    if (!filterFn(itm)) { return; }

    holder = parseInt('' + itm.PlanEstimate, 10);

    if (!isNaN(holder) && holder) {
      sum = sum + holder;
    }
  });

  return sum;
};

var __sumStories = function (storiesByFeature, filterFn) {
  var map = {};

  Ext.Object.each(storiesByFeature, function (fid, stories) {
    map[fid] = __sumArray(stories, filterFn);
  });

  return map;
};

Ext.define('FeatureProfileCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',

    prepareChartData: function (stores) {
      var snapshots = [];

      Ext.Array.each(stores, function (store) {
        store.each(function (record) {
          snapshots.push(record.raw);
        });
      });

      return this.runCalculation(snapshots);
    },

    _mapFeatures: function (records) {
      var map = {};

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('portfolioitem') === -1) { return; }

        map[record.ObjectID] = record;
      });

      return map;
    },

    _sortFeaturesByRank: function (featureMap) {
      var rank = Ext.Object.getKeys(featureMap);

      rank.sort(function (a, b) {
        return featureMap[a].Rank - featureMap[b].Rank;
      });

      return rank;
    },

    _hydrate: function (arr, map) {
      var ret = [];

      Ext.Array.each(arr, function (itm) {
        ret.push(map[itm]);
      });

      return ret;
    },

    _groupStoriesByFeature: function (records) {
      var map = {};
      var featureField = this.featureField;

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase() !== 'hierarchicalrequirement') { return; }
        if (!record[featureField]) { return; }

        console.log('Feature', featureField, record);
        map[record[featureField].ObjectID] = map[record[featureField].ObjectID] || [];
        map[record[featureField].ObjectID].push(record);
      });

      return map;
    },

    _sumPreIPStories: function (storiesByFeature) {
      var filterFn = function (s) { return Ext.isEmpty(s.InProgressDate); };
      return __sumStories(storiesByFeature, filterFn);
    },

    _sumIPStories: function (storiesByFeature) {
      var filterFn = function (s) { return !Ext.isEmpty(s.InProgressDate) && Ext.isEmpty(s.AcceptedDate); };
      return __sumStories(storiesByFeature, filterFn);
    },

    _sumAcceptedStories: function (storiesByFeature) {
      var filterFn = function (s) { return !Ext.isEmpty(s.AcceptedDate); };
      return __sumStories(storiesByFeature, filterFn);
    },

    _sumAllStories: function (storiesByFeature) {
      var filterFn = function (s) { return true };
      return __sumStories(storiesByFeature, filterFn);
    },

    runCalculation: function (records) {
      var me = this;
      var featureMap = me._mapFeatures(records);
      var featureOrder = me._sortFeaturesByRank(featureMap);
      var storiesByFeature = me._groupStoriesByFeature(records);
      var notStartedStoryPointsByFeature = me._sumPreIPStories(storiesByFeature);
      var inProgressStoryPointsByFeature = me._sumIPStories(storiesByFeature);
      var acceptedStoryPointsByFeature = me._sumAcceptedStories(storiesByFeature);
      var allStoryPoints = me._sumAllStories(storiesByFeature);
      var notStartedSeries = [];
      var inProgressSeries = [];
      var featureSeries = [];
      var acceptedSeries = [];
      var allSeries = [];
      var featureCostSeries = [];
      var series = [];
      var categories = [];

      Ext.Array.each(featureOrder, function (fid) {
        var where = allSeries.length - 1;
        var storyCost, featureCost;
        var featurePoints = (featureMap[fid].PreliminaryEstimate && featureMap[fid].PreliminaryEstimate.Value) || 0;

        categories.push('' + featureMap[fid].ObjectID + '::' + featureMap[fid].FormattedID + '::' + featureMap[fid].Name);

        notStartedSeries.push(notStartedStoryPointsByFeature[fid] || 0);
        inProgressSeries.push(inProgressStoryPointsByFeature[fid] || 0);
        acceptedSeries.push(acceptedStoryPointsByFeature[fid]|| 0);
        if (where >= 0 ) {
          storyCost = allSeries[where] + ((allStoryPoints[fid] || 0) * me.costPerPoint);
          featureCost = featureCostSeries[where] + (featurePoints * me.costPerPoint);
        } else {
          storyCost = (allStoryPoints[fid] || 0) * me.costPerPoint;
          featureCost = featurePoints * me.costPerPoint;
        }
        allSeries.push(storyCost);
        featureSeries.push(featurePoints);
        featureCostSeries.push(featureCost);
      });


      series.push({
        yAxis: 0,
        type: 'column',
        name: 'Accepted',
        stack: 'story',
        data: acceptedSeries
      });

      series.push({
        yAxis: 0,
        type: 'column',
        name: 'InProgress',
        stack: 'story',
        data: inProgressSeries
      });

      series.push({
        yAxis: 0,
        type: 'column',
        name: 'Not Started',
        stack: 'story',
        data: notStartedSeries
      });

      series.push({
        yAxis: 0,
        type: 'column',
        name: 'Feature Points',
        stack: 'feature',
        data: featureSeries
      });

      series.push({
        yAxis: 1,
        type: 'spline',
        name: 'Cumulative Cost',
        data: allSeries
      });

      series.push({
        yAxis: 1,
        type: 'spline',
        name: 'Cumulative Feature Cost',
        data: featureCostSeries
      });

      return {
        categories: categories,
        series: series
      };
    }
});
