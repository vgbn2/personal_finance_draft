#include <stdio.h>
#include <math.h>
void swap(int a,int b){
    int temp=a;
    b=a;
    b=temp;
}
int ngto(int n){
    if(n<2)return 0;
    for(int i=2;i<sqrt(n);i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int main(){
    int a,b;scanf("%d%d",&a,&b);
    if(a>b)swap(a,b);
    int count=1;
    for(int i=a;i<=b;i++){
        count++;
        if(ngto(i))count--;
    }
    printf("%d",count);
}