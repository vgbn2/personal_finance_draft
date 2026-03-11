#include <stdio.h>
void swap(int a,int b){
    int temp=b;
    b=a;
    a=temp;

}
int check(int a){
    int d=a%10;
    a/=10;
    while (a > 0)
    {
        if (a % 10 <= d)
            return 0;
        d=a% 10;
        a/= 10;
    }
    return 1;
return 1;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a,b,count=0;scanf("%d%d",&a,&b);
        if(a>b)swap(a,b);
        for(int j=a;j<=b;j++){
            if(check(j)){
                count++;
            }
        }
        printf("%d\n",count);
    }
}