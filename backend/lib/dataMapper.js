// Transforms data from source endpoint to destination endpoint format
export class DataMapper {
  // mapping can be:
  // - object: { destField: '$.path.to.value', ... }
  // - array of rules: [{ sourcePath|source, destField|dest, transform? }, ...]
  transform(sourceData, mapping) {
    if (!mapping) return sourceData;
    // object form
    if (!Array.isArray(mapping) && typeof mapping === 'object') {
      if (Object.keys(mapping).length === 0) return sourceData;
      const result = {};
      for (const [destField, sourcePath] of Object.entries(mapping)) {
        result[destField] = this.getValueByPath(sourceData, sourcePath);
      }
      return result;
    }
    // array form
    if (Array.isArray(mapping)) {
      return this.transformAdvanced(sourceData, mapping);
    }
    return sourceData;
  }
  getValueByPath(obj, path) {
    if (!path || typeof path !== 'string') return undefined;
    if (!path.startsWith('$.')) return path; // literal
    const keys = path.slice(2).split('.').filter(Boolean);
    let cur = obj;
    for (const k of keys) {
      if (cur && typeof cur === 'object' && k in cur) cur = cur[k]; else return undefined;
    }
    return cur;
  }
  transformAdvanced(sourceData, mappingRules) {
    const result = {};
    for (const rule of mappingRules) {
      const srcPath = rule.sourcePath ?? rule.source;
      const destField = rule.destField ?? rule.dest;
      const value = this.getValueByPath(sourceData, srcPath);
      result[destField] = rule.transform ? rule.transform(value) : value;
    }
    return result;
  }
}
