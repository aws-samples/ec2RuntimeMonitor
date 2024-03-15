// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
export const handler = async(event, context, callback) => {
  
    const boolRegex = new RegExp("^(True)|(true)|(False)|(false)$")
    const intRegex = new RegExp("^[0-9]+$")

    const params = event["Parameters"]
    const tags = event["Tags"]
    
    if ( ! ( params && tags ) ){
        throw new SyntaxError("Event error. Parameters : " + params + " , Tags : " + tags )
    }
    
    const result = {}
    
    function newRegex(x) {
      try {
        return RegExp(x)
      } catch (e) {
        throw new SyntaxError(e) 
      }
    }
    
    for ( let param in params ){
      // Try build param regex through Lambda to handle bad regex syntax error
      const regex = newRegex(params[param]["Regex"])
      // retrieve default
      const defaultValue = params[param]["Default"]
      // look for param in tags
      const tag = tags.find(tag => tag["Key"] === param)
      // replace missing tags with empty string
      const tagValue = tag ? tag["Value"] : ""
      // check default
      const validDefaultValue = regex.test(defaultValue)
      // check tag value. If not empty, apply regex. 
      const validTagValue = tagValue ? regex.test(tagValue) : false
      // choose tag or default
      const final = validTagValue ? tagValue : validDefaultValue ? defaultValue : ""
      // log all steps      
      const all = {
        regex: regex,
        defaultValue: defaultValue,
        tag: tag,
        tagValue: tagValue,
        validDefaultValue: validDefaultValue,
        validTagValue: validTagValue,
        final: final
      }
      console.log(all)
      // throw error or store param in result
      if ( final ){
        // cast if possible. Int or Bool only.
        switch (true) {
          case intRegex.test(final):
            result[param] = parseInt(final)
            break
          case boolRegex.test(final):
            result[param] = (final.toLowerCase() === "true")
            break
          default:
            result[param] = final
        }
        
      }else{
        throw new SyntaxError("Parameter error. " + param + " : '" + final + "'" )
      }
    }
    callback(null, result)

}
