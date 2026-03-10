#include <stdio.h>
int main(){
    double a,b;
    scanf("%lf %lf", &a, &b);
    if(a==0&&b!=0){
        printf("Vo nghiem");       
    }
    else if(a==0&&b==0){
        printf("Vo so nghiem");
    }
    else {
        double x= -b/a;
        printf("%.2lf",x);
    }
    
}