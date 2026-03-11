#include <stdio.h>
#include <math.h>
void swap(int a,int b){
    int temp=b;
    b=a;
    a=temp;
}
int ngto(int n){
    if(n<2)return 0;
    for(int i=2;i<=sqrt(n);i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int palin(int n){
    int rev=0,o=n;
    while(n>0){
        rev=rev*10+(n%10);
        n/=10;
    }
    return rev==o;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a,b,count=0;scanf("%d%d",&a,&b);
        if(a>b)swap(a,b);
        for(int i=a;i<=b;i++){
            if(palin(i)&&ngto(i)){
                printf("%d ",i);
                count++;
                if(count%10==0)printf("\n");
            }
        }
        printf("\n");
    }
}