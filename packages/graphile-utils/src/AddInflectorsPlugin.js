export default function AddInflectorsPlugin(additionalInflectors) {
  return builder => {
    builder.hook("inflection", (inflection, build) => {
      return build.extend(inflection, additionalInflectors);
    });
  };
}
