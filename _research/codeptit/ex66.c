#include <stdio.h>
#include <math.h>
void ss(int *a, int *b)
{
    int temp = *a;
    *a = *b;
    *b = temp;
}
int check(int n){
    int sum=1;
for(int i=2;i<sqrt(n);i++){
    if(n%i==0)
    sum+=i+n/i;
    if(i*i==n){
        sum=sum-i;
    }
}
return sum==n;
}
int main(){
    int a,b;scanf("%d%d",&a,&b);
    if(a>b){
        ss(&a,&b);
    }
    for(int i=a;i<=b;i++){
        if(check(i))
        printf("%d ",i);
    }
    printf("\n");
}