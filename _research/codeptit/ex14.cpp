#include <stdio.h>
#include<math.h>
int main() {
  float a, b, c;
  scanf("%f %f %f", &a, &b, &c);
  
  float delta = b * b - 4 * a *c;
  
  if( a == 0) {
  	if( b == 0) {
  		printf("NO");
	  } else {
	  	printf("%.2f", - c / b);
	  }
  }else{
  	 if(delta  == 0) {
  	printf("%.2f", -b/ (2 * a));
  } else if (delta < 0) {
  	printf("NO");
  } else {
  	float x1 = ((-b + sqrt(delta))/ (2 * a));
  	float x2 = ((-b - sqrt(delta)) / (2 * a));
  	printf("%.2f %.2f \n", x1, x2);
  }
  }
}