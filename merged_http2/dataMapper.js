// backend/lib/dataMapper.js - PRODUCTION READY
// Transforms data from source endpoint to destination endpoint format

export class DataMapper {
  /**
   * Transform source data using mapping rules
   * Example mapping:
   * {
   *   "destination_field": "$.source.path.to.value",
   *   "another_field": "$.literal_value"
   * }
   */
  transform(sourceData, mapping) {
    if (!mapping || Object.keys(mapping).length === 0) {
      return sourceData; // Return as-is if no mapping
    }

    const result = {};

    for (const [destField, sourcePath] of Object.entries(mapping)) {
      result[destField] = this.getValueByPath(sourceData, sourcePath);
    }

    return result;
  }

  /**
   * Get value from object using JSON path notation
   * Example: "$.user.profile.name"
   */
  getValueByPath(obj, path) {
    if (!path.startsWith('$.')) {
      return path; // Return literal if not a path
    }

    const keys = path
      .replace('$.', '')
      .split('.')
      .filter(k => k.length > 0);

    let value = obj;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Advanced mapping with functions
   */
  transformAdvanced(sourceData, mappingRules) {
    const result = {};

    for (const rule of mappingRules) {
      const value = this.getValueByPath(sourceData, rule.source);

      if (rule.transform) {
        result[rule.dest] = rule.transform(value);
      } else {
        result[rule.dest] = value;
      }
    }

    return result;
  }
}
